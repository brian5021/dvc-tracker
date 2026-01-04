import type { StayRepository } from "../repository/stay-repository"
import type { PointService } from "./point-service"
import type { StayValidator } from "../validators/stay-validator"
import type { TransferService } from "./transfer-service"
import type { MemberRepository } from "../repository/member-repository"
import type { Stay, StayResult } from "../models/stay"
import type { Member, MemberPoints } from "../models/member"
import { generateTransactionId } from "../utils/transaction-utils"
import { createErrorResult } from "../utils/error-handling"
import { format } from "date-fns"

export class StayService {
  private stayRepository: StayRepository
  private pointService: PointService
  private stayValidator: StayValidator
  private transferService: TransferService
  private memberRepository: MemberRepository

  constructor(
    stayRepository: StayRepository,
    pointService: PointService,
    stayValidator: StayValidator,
    transferService: TransferService,
    memberRepository: MemberRepository,
  ) {
    this.stayRepository = stayRepository
    this.pointService = pointService
    this.stayValidator = stayValidator
    this.transferService = transferService
    this.memberRepository = memberRepository
  }

  /**
   * Gets all stays
   * @returns Array of stays
   */
  async getStays(): Promise<Stay[]> {
    return this.stayRepository.getAll()
  }

  /**
   * Adds a new stay with transaction-like behavior and prioritizes banked points
   * @param stay The stay to add
   * @returns Result of the operation
   */
  async addStay(stay: Omit<Stay, "id" | "createdAt" | "transactionId">): Promise<StayResult> {
    try {
      // Start a "transaction"
      const transactionId = generateTransactionId()

      // Validate the stay before adding
      const validationResult = await this.stayValidator.validate(stay)
      if (!validationResult.success) {
        return validationResult
      }

      // Get current member points
      const memberPoints = await this.memberRepository.getAll()

      // Process point allocation with banked points priority
      const allocationResult = await this.processPointAllocationWithBankedPriority(stay, memberPoints, transactionId)
      if (!allocationResult.success) {
        return allocationResult
      }

      // Update the stay allocation to include borrowing information
      const updatedAllocation = allocationResult.updatedAllocation

      // Prepare the new stay with updated allocation
      const newStay: Stay = {
        ...stay,
        id: `stay${Date.now()}`,
        createdAt: Date.now(),
        transactionId,
        allocation: updatedAllocation,
      }

      // Try to update points first - this is the most critical operation
      const updateResult = await this.pointService.updatePointsAfterStayChange(newStay, "add")
      if (!updateResult.success) {
        return {
          success: false,
          message: updateResult.message,
          error: updateResult.error,
        }
      }

      // If point update succeeds, add the stay
      try {
        await this.stayRepository.add(newStay)

        // Log the action
        await this.stayRepository.logAction({
          transactionId,
          action: "create",
          stay: newStay,
          timestamp: Date.now(),
        })

        return {
          success: true,
          message: "Stay added successfully",
          stay: newStay,
        }
      } catch (error) {
        // If adding the stay fails, we need to rollback the point changes
        console.error("Error adding stay, rolling back point changes:", error)
        await this.pointService.updatePointsAfterStayChange(newStay, "remove")

        // Also rollback any transfers that were created
        if (allocationResult.transfers && allocationResult.transfers.length > 0) {
          for (const transfer of allocationResult.transfers) {
            await this.transferService.updateTransferStatus(transfer.id, "Returned")
          }
        }

        return createErrorResult<StayResult>("Failed to add stay. Points were not deducted.", error)
      }
    } catch (error) {
      console.error("Error in addStay transaction:", error)
      return createErrorResult<StayResult>("An unexpected error occurred", error)
    }
  }

  /**
   * Process point allocation with banked points priority
   * @param stay The stay to process
   * @param memberPoints Current member points
   * @param transactionId Transaction ID for tracking
   * @returns Result with updated allocation and transfers
   */
  private async processPointAllocationWithBankedPriority(
    stay: Omit<Stay, "id" | "createdAt" | "transactionId">,
    memberPoints: MemberPoints[],
    transactionId: string,
  ): Promise<{
    success: boolean
    message: string
    updatedAllocation?: any[]
    transfers?: any[]
    error?: string
  }> {
    try {
      const updatedAllocation = [...stay.allocation]
      const transfers = []

      // Process each member's allocation
      for (let i = 0; i < updatedAllocation.length; i++) {
        const allocation = updatedAllocation[i]
        const member = memberPoints.find((m) => m.name === allocation.member)

        if (!member) {
          return {
            success: false,
            message: `Member ${allocation.member} not found`,
          }
        }

        // Check if member has enough banked points
        if ((member.bankedPoints || 0) >= allocation.points) {
          // Member has enough banked points, no transfers needed
          continue
        }

        // Member doesn't have enough banked points
        // Use all available banked points first
        const bankedPointsToUse = member.bankedPoints || 0
        const remainingPointsNeeded = allocation.points - bankedPointsToUse

        // Check if member has enough current year points to cover the remaining
        if ((member.currentYearPoints || 0) < remainingPointsNeeded) {
          return {
            success: false,
            message: `${member.name} doesn't have enough points (banked + current) to cover the allocation`,
          }
        }

        // Find other members with available banked points
        const otherMembers = memberPoints.filter((m) => m.name !== member.name && (m.bankedPoints || 0) > 0)

        if (otherMembers.length === 0) {
          return {
            success: false,
            message: `No other members have banked points available to transfer`,
          }
        }

        // Calculate how many points to borrow from each member
        let pointsStillNeeded = remainingPointsNeeded
        const borrowing = []

        for (const otherMember of otherMembers) {
          if (pointsStillNeeded <= 0) break

          const pointsToBorrow = Math.min(pointsStillNeeded, otherMember.bankedPoints || 0)

          if (pointsToBorrow > 0) {
            // Create a transfer from other member to this member
            const transfer = {
              fromMember: otherMember.name as Member,
              toMember: member.name as Member,
              points: pointsToBorrow,
              useYear: new Date().getFullYear().toString(),
              transferDate: format(new Date(), "yyyy-MM-dd"),
              returnDate: format(new Date(new Date().getFullYear() + 1, 8, 1), "yyyy-MM-dd"), // Next Sept 1
              status: "Active" as const,
              notes: `Automatic transfer of banked points for stay at ${stay.resort}`,
            }

            const transferResult = await this.transferService.addTransfer(transfer)

            if (!transferResult.success) {
              return {
                success: false,
                message: `Failed to transfer points: ${transferResult.message}`,
                error: transferResult.error,
              }
            }

            transfers.push(transferResult.transfer)

            // Record the borrowing
            borrowing.push({
              borrowedFrom: otherMember.name,
              borrowedPoints: pointsToBorrow,
              transferId: transferResult.transfer?.id,
            })

            // Update the other member's available banked points
            otherMember.bankedPoints -= pointsToBorrow

            // Reduce the points still needed
            pointsStillNeeded -= pointsToBorrow
          }
        }

        if (pointsStillNeeded > 0) {
          return {
            success: false,
            message: `Could not borrow enough banked points from other members`,
          }
        }

        // Update the allocation to include borrowing information
        updatedAllocation[i] = {
          ...allocation,
          borrowedFrom: borrowing.map((b) => b.borrowedFrom),
          borrowedPoints: borrowing.map((b) => b.borrowedPoints),
        }

        // Now immediately repay the borrowed points with current year points
        for (const borrow of borrowing) {
          // Create a repayment transfer (from borrower to lender)
          const repayTransfer = {
            fromMember: member.name as Member,
            toMember: borrow.borrowedFrom as Member,
            points: borrow.borrowedPoints,
            useYear: new Date().getFullYear().toString(),
            transferDate: format(new Date(), "yyyy-MM-dd"),
            returnDate: format(new Date(), "yyyy-MM-dd"), // Immediate return
            status: "Active" as const, // Create as Active so it shows in history
            notes: `Immediate repayment of banked points with current year points for stay at ${stay.resort}. These points should be added as CURRENT YEAR points, not banked points.`,
          }

          // Add the repayment transfer
          const repayResult = await this.transferService.addTransfer(repayTransfer)

          if (!repayResult.success) {
            return {
              success: false,
              message: `Failed to repay borrowed points: ${repayResult.message}`,
              error: repayResult.error,
            }
          }

          transfers.push(repayResult.transfer)

          // Update the member's current year points directly
          // We don't need to deduct from borrower's current year points here
          // because the transfer service will handle that when processing the repayment transfer

          // Add to lender's current year points (not banked points)
          // This is also handled by the transfer service, so we don't need to do it here

          // Mark the repayment transfer as returned immediately
          const repaymentResult = await this.transferService.updateTransferStatus(repayResult.transfer!.id, "Returned")
          if (!repaymentResult.success) {
            return {
              success: false,
              message: `Failed to process repayment: ${repaymentResult.message}`,
              error: repaymentResult.error,
            }
          }

          // Also mark the original banked points transfer as returned
          if (borrow.transferId) {
            // We need to manually update the lender's current year points here
            // because the transfer service doesn't know this is a special case
            const lenderIndex = memberPoints.findIndex((m) => m.name === borrow.borrowedFrom)
            if (lenderIndex !== -1) {
              // Add the points to the lender's current year points
              memberPoints[lenderIndex].currentYearPoints += borrow.borrowedPoints
            }

            await this.transferService.updateTransferStatus(borrow.transferId, "Returned")
          }
        }
      }

      // Update all member points after processing
      await this.memberRepository.updateAll(memberPoints)

      return {
        success: true,
        message: "Point allocation processed successfully",
        updatedAllocation,
        transfers,
      }
    } catch (error) {
      console.error("Error processing point allocation:", error)
      return {
        success: false,
        message: "An unexpected error occurred while processing point allocation",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Updates an existing stay
   * @param stayId The ID of the stay to update
   * @param updatedStay The updated stay data
   * @returns The updated stay or null if not found
   */
  async updateStay(stayId: string, updatedStay: Partial<Stay>): Promise<Stay | null> {
    try {
      const existingStay = await this.stayRepository.getById(stayId)

      if (!existingStay) {
        return null
      }

      const oldStay = { ...existingStay }
      const newStay = { ...oldStay, ...updatedStay }

      const success = await this.stayRepository.update(newStay)
      if (!success) {
        return null
      }

      // Update point allocations if points changed
      if (
        oldStay.points !== newStay.points ||
        JSON.stringify(oldStay.allocation) !== JSON.stringify(newStay.allocation)
      ) {
        await this.pointService.updatePointsAfterStayChange(oldStay, "remove")
        await this.pointService.updatePointsAfterStayChange(newStay, "add")
      }

      // Log the update
      await this.stayRepository.logAction({
        transactionId: newStay.transactionId,
        action: "update",
        stay: newStay,
        timestamp: Date.now(),
        previousState: oldStay,
      })

      return newStay
    } catch (error) {
      console.error("Error updating stay:", error)
      return null
    }
  }

  /**
   * Deletes a stay
   * @param stayId The ID of the stay to delete
   * @returns True if successful, false otherwise
   */
  async deleteStay(stayId: string): Promise<boolean> {
    try {
      const stayToRemove = await this.stayRepository.getById(stayId)

      if (!stayToRemove) {
        return false
      }

      // Remove the stay
      const success = await this.stayRepository.delete(stayId)
      if (!success) {
        return false
      }

      // Update point allocations
      await this.pointService.updatePointsAfterStayChange(stayToRemove, "remove")

      // Log the deletion
      await this.stayRepository.logAction({
        transactionId: stayToRemove.transactionId,
        action: "delete",
        stay: stayToRemove,
        timestamp: Date.now(),
      })

      return true
    } catch (error) {
      console.error("Error deleting stay:", error)
      return false
    }
  }
}

