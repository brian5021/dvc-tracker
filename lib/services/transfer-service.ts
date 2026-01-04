import type { TransferRepository } from "../repository/transfer-repository"
import type { MemberRepository } from "../repository/member-repository"
import type { TransferValidator } from "../validators/transfer-validator"
import type { PointTransfer, TransferResult } from "../models/transfer"
import { generateTransactionId } from "../utils/transaction-utils"
import { createErrorResult } from "../utils/error-handling"

export class TransferService {
  private transferRepository: TransferRepository
  private memberRepository: MemberRepository
  private transferValidator: TransferValidator

  constructor(
    transferRepository: TransferRepository,
    memberRepository: MemberRepository,
    transferValidator: TransferValidator,
  ) {
    this.transferRepository = transferRepository
    this.memberRepository = memberRepository
    this.transferValidator = transferValidator
  }

  /**
   * Gets all transfers
   * @returns Array of transfers
   */
  async getTransfers(): Promise<PointTransfer[]> {
    return this.transferRepository.getAll()
  }

  /**
   * Adds a new transfer with transaction-like behavior
   * @param transfer The transfer to add
   * @returns Result of the operation
   */
  async addTransfer(transfer: Omit<PointTransfer, "id" | "createdAt" | "transactionId">): Promise<TransferResult> {
    try {
      // Start a "transaction"
      const transactionId = generateTransactionId()

      // Validate the transfer
      const validationResult = await this.transferValidator.validate(transfer)
      if (!validationResult.success) {
        return validationResult
      }

      // Extract repayment year from returnDate
      const repaymentYear = new Date(transfer.returnDate).getFullYear().toString()

      // Prepare the new transfer
      const newTransfer: PointTransfer = {
        ...transfer,
        id: `transfer${Date.now()}`,
        createdAt: Date.now(),
        transactionId,
        repaymentYear,
        repaymentStatus: "Scheduled",
      }

      // Try to update member points first - this is the most critical operation
      const updateResult = await this.updatePointsAfterTransfer(newTransfer)
      if (!updateResult.success) {
        return updateResult
      }

      // If point update succeeds, add the transfer
      try {
        await this.transferRepository.add(newTransfer)

        // Log the transfer for audit purposes
        await this.transferRepository.logAction({
          transactionId,
          action: "create",
          transfer: newTransfer,
          timestamp: Date.now(),
        })

        return {
          success: true,
          message: "Transfer completed successfully",
          transfer: newTransfer,
        }
      } catch (error) {
        // If adding the transfer fails, we need to rollback the point changes
        console.error("Error adding transfer, rolling back point changes:", error)
        await this.reverseTransfer(newTransfer)

        return createErrorResult<TransferResult>("Failed to complete transfer. Points were not transferred.", error)
      }
    } catch (error) {
      console.error("Error in addTransfer transaction:", error)
      return createErrorResult<TransferResult>("An unexpected error occurred", error)
    }
  }

  /**
   * Updates a transfer's status
   * @param transferId The ID of the transfer to update
   * @param status The new status
   * @returns Result of the operation
   */
  async updateTransferStatus(transferId: string, status: "Active" | "Returned"): Promise<TransferResult> {
    try {
      const transfer = await this.transferRepository.getById(transferId)

      if (!transfer) {
        return createErrorResult<TransferResult>("Transfer not found")
      }

      // If already in the requested state, no change needed
      if (transfer.status === status) {
        return {
          success: true,
          message: `Transfer already marked as ${status}`,
          transfer,
        }
      }

      const oldTransfer = { ...transfer }
      const newTransfer = { ...oldTransfer, status }

      // Update member points if status changed from Active to Returned
      if (oldTransfer.status === "Active" && status === "Returned") {
        const updateResult = await this.reverseTransfer(oldTransfer)
        if (!updateResult.success) {
          // If reversing fails, return the error but don't update the status
          return updateResult
        }
      }

      // Only update the transfer status if the point update was successful
      const success = await this.transferRepository.update(newTransfer)
      if (!success) {
        return createErrorResult<TransferResult>("Failed to update transfer status")
      }

      // Log the status change for audit purposes
      await this.transferRepository.logAction({
        transactionId: oldTransfer.transactionId,
        action: "update",
        transfer: newTransfer,
        timestamp: Date.now(),
        previousStatus: oldTransfer.status,
      })

      return {
        success: true,
        message: `Transfer marked as ${status} successfully`,
        transfer: newTransfer,
      }
    } catch (error) {
      console.error("Error updating transfer status:", error)
      return createErrorResult<TransferResult>("An unexpected error occurred", error)
    }
  }

  /**
   * Updates points after a transfer is created
   * @param transfer The transfer
   * @returns Result of the operation
   */
  private async updatePointsAfterTransfer(transfer: PointTransfer): Promise<TransferResult> {
    try {
      if (transfer.status === "Returned") {
        return { success: true, message: "No need to update points for returned transfers" }
      }

      const memberPoints = await this.memberRepository.getAll()

      // Find the members
      const fromMemberIndex = memberPoints.findIndex((member) => member.name === transfer.fromMember)
      const toMemberIndex = memberPoints.findIndex((member) => member.name === transfer.toMember)

      if (fromMemberIndex === -1 || toMemberIndex === -1) {
        return createErrorResult<TransferResult>("One or both members not found")
      }

      // Double-check that sender has enough points
      if (memberPoints[fromMemberIndex].available < transfer.points) {
        return createErrorResult<TransferResult>(`${transfer.fromMember} does not have enough available points`)
      }

      // Check if this is a repayment of banked points with current year points
      const isRepaymentOfBankedPoints = transfer.notes?.includes(
        "Immediate repayment of banked points with current year points",
      )

      // Check if this is an automatic transfer of banked points
      const isAutomaticBankedTransfer = transfer.notes?.includes("Automatic transfer of banked points for stay")

      // Update lender (fromMember)
      memberPoints[fromMemberIndex].lent += transfer.points
      memberPoints[fromMemberIndex].available -= transfer.points

      // If this is a repayment, we need to reduce current year points (not banked points)
      if (isRepaymentOfBankedPoints) {
        // Reduce from current year points of the sender
        memberPoints[fromMemberIndex].currentYearPoints -= transfer.points
      } else if (isAutomaticBankedTransfer) {
        // Reduce from banked points of the sender
        memberPoints[fromMemberIndex].bankedPoints -= transfer.points
      }

      // Update borrower (toMember)
      memberPoints[toMemberIndex].borrowed += transfer.points
      memberPoints[toMemberIndex].available += transfer.points

      // If this is a repayment, add to current year points of the receiver (not banked points)
      if (isRepaymentOfBankedPoints) {
        // Add to current year points of the receiver
        memberPoints[toMemberIndex].currentYearPoints += transfer.points
      }

      await this.memberRepository.updateAll(memberPoints)

      return {
        success: true,
        message: "Points updated successfully",
      }
    } catch (error) {
      console.error("Error updating points after transfer:", error)
      return createErrorResult<TransferResult>("Failed to update points", error)
    }
  }

  /**
   * Reverses a transfer by updating member points
   * @param transfer The transfer to reverse
   * @returns Result of the operation
   */
  private async reverseTransfer(transfer: PointTransfer): Promise<TransferResult> {
    try {
      const memberPoints = await this.memberRepository.getAll()

      // Find the members
      const fromMemberIndex = memberPoints.findIndex((member) => member.name === transfer.fromMember)
      const toMemberIndex = memberPoints.findIndex((member) => member.name === transfer.toMember)

      if (fromMemberIndex === -1 || toMemberIndex === -1) {
        return createErrorResult<TransferResult>("One or both members not found")
      }

      // Check if borrower has enough available points to return
      if (memberPoints[toMemberIndex].available < transfer.points) {
        return createErrorResult<TransferResult>(`${transfer.toMember} does not have enough available points to return`)
      }

      // Check if this is a repayment of banked points with current year points
      const isRepaymentOfBankedPoints = transfer.notes?.includes(
        "Immediate repayment of banked points with current year points",
      )

      // Check if this is an automatic transfer of banked points
      const isAutomaticBankedTransfer = transfer.notes?.includes("Automatic transfer of banked points for stay")

      // Update lender (fromMember) - return their points
      memberPoints[fromMemberIndex].lent -= transfer.points
      memberPoints[fromMemberIndex].available += transfer.points

      // If this was a repayment, we need to adjust current year points, not banked points
      if (isRepaymentOfBankedPoints) {
        // Add back to current year points of the original sender
        memberPoints[fromMemberIndex].currentYearPoints += transfer.points
      } else if (isAutomaticBankedTransfer) {
        // Add back to banked points of the original sender
        memberPoints[fromMemberIndex].bankedPoints += transfer.points
      } else {
        // For normal transfers, we don't need to adjust specific point types
        // The lent/borrowed and available points are already updated above
      }

      // Update borrower (toMember) - remove their borrowed points
      memberPoints[toMemberIndex].borrowed -= transfer.points
      memberPoints[toMemberIndex].available -= transfer.points

      // If this was a repayment, we need to adjust current year points, not banked points
      if (isRepaymentOfBankedPoints) {
        // Remove from current year points of the original receiver
        memberPoints[toMemberIndex].currentYearPoints -= transfer.points
      }

      // Save the updated member points
      await this.memberRepository.updateAll(memberPoints)

      return {
        success: true,
        message: "Points returned successfully",
      }
    } catch (error) {
      console.error("Error reversing transfer:", error)
      return createErrorResult<TransferResult>("Failed to reverse transfer", error)
    }
  }
}
