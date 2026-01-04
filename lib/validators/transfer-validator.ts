import type { MemberRepository } from "../repository/member-repository"
import type { PointTransfer, TransferResult } from "../models/transfer"
import { createErrorResult } from "../utils/error-handling"

export class TransferValidator {
  private memberRepository: MemberRepository

  constructor(memberRepository: MemberRepository) {
    this.memberRepository = memberRepository
  }

  /**
   * Validates a transfer before adding
   * @param transfer The transfer to validate
   * @returns Validation result
   */
  async validate(transfer: Omit<PointTransfer, "id" | "createdAt" | "transactionId">): Promise<TransferResult> {
    // Check that sender and recipient are different
    if (transfer.fromMember === transfer.toMember) {
      return createErrorResult<TransferResult>("Cannot transfer points to the same member")
    }

    // Check that points are positive
    if (transfer.points <= 0) {
      return createErrorResult<TransferResult>("Points must be greater than zero")
    }

    // Check that sender has enough available points
    const memberPoints = await this.memberRepository.getAll()
    const fromMember = memberPoints.find((member) => member.name === transfer.fromMember)

    if (!fromMember) {
      return createErrorResult<TransferResult>("Sender not found")
    }

    if (fromMember.available < transfer.points) {
      return createErrorResult<TransferResult>(
        `${transfer.fromMember} does not have enough available points (${fromMember.available} available)`,
      )
    }

    return {
      success: true,
      message: "Transfer validation successful",
    }
  }
}
