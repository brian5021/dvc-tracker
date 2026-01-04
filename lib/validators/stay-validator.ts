import type { MemberRepository } from "../repository/member-repository"
import type { Stay, StayResult } from "../models/stay"
import { createErrorResult } from "../utils/error-handling"

export class StayValidator {
  private memberRepository: MemberRepository

  constructor(memberRepository: MemberRepository) {
    this.memberRepository = memberRepository
  }

  /**
   * Validates a stay before adding or updating
   * @param stay The stay to validate
   * @returns Validation result
   */
  async validate(stay: Omit<Stay, "id" | "createdAt" | "transactionId">): Promise<StayResult> {
    // Check that the stay has valid dates
    if (!stay.checkIn || !stay.checkOut) {
      return createErrorResult<StayResult>("Stay must have valid check-in and check-out dates")
    }

    // Check that points are positive
    if (stay.points <= 0) {
      return createErrorResult<StayResult>("Points must be greater than zero")
    }

    // Check that the allocation adds up to the total points
    const totalAllocated = stay.allocation.reduce((sum, alloc) => sum + alloc.points, 0)
    if (totalAllocated !== stay.points) {
      return createErrorResult<StayResult>(
        `Point allocation (${totalAllocated}) does not match total points (${stay.points})`,
      )
    }

    // Check that each member has enough available points
    const memberPoints = await this.memberRepository.getAll()

    for (const alloc of stay.allocation) {
      const member = memberPoints.find((m) => m.name === alloc.member)
      if (!member) {
        return createErrorResult<StayResult>(`Member ${alloc.member} not found`)
      }

      if (member.available < alloc.points) {
        return createErrorResult<StayResult>(
          `${alloc.member} does not have enough available points (${member.available} available, ${alloc.points} needed)`,
        )
      }
    }

    return {
      success: true,
      message: "Stay validation successful",
    }
  }
}
