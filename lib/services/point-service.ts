import type { PointSummaryRepository } from "../repository/point-summary-repository"
import type { MemberRepository } from "../repository/member-repository"
import type { PointSummary } from "../models/point-allocation"
import type { MemberPoints } from "../models/member"
import type { Stay } from "../models/stay"
import { getCurrentContractYear, formatContractYearRange } from "../utils/date-utils"

export class PointService {
  private pointSummaryRepository: PointSummaryRepository
  private memberRepository: MemberRepository

  constructor(pointSummaryRepository: PointSummaryRepository, memberRepository: MemberRepository) {
    this.pointSummaryRepository = pointSummaryRepository
    this.memberRepository = memberRepository
  }

  /**
   * Gets the point summary by calculating it from member points
   * @returns The calculated point summary
   */
  async getPointSummary(): Promise<PointSummary> {
    // Get all member points
    const memberPoints = await this.memberRepository.getAll()

    // Calculate the point summary from member points
    return this.calculatePointSummary(memberPoints)
  }

  /**
   * Calculates the point summary from member points
   * @param memberPoints Array of member points
   * @returns The calculated point summary
   */
  calculatePointSummary(memberPoints: MemberPoints[]): PointSummary {
    // Calculate totals
    const totalPoints = memberPoints.reduce((sum, member) => sum + member.total, 0)
    const availablePoints = memberPoints.reduce((sum, member) => sum + member.available, 0)
    const usedPoints = memberPoints.reduce((sum, member) => sum + member.used, 0)

    // Get current and previous contract years
    const currentContractYear = getCurrentContractYear()
    const previousContractYear = currentContractYear - 1

    // Calculate current year points (sum of all members' currentYearPoints)
    const currentYearTotal = memberPoints.reduce((sum, member) => sum + (member.currentYearPoints || 0), 0)
    const currentYearUsed = memberPoints.reduce(
      (sum, member) =>
        sum +
        Math.max(
          0,
          (member.currentYearPoints || 0) -
            (member.pointsBeingBanked || 0) -
            (member.available - member.borrowed + member.lent),
        ),
      0,
    )
    const currentYearAvailable = currentYearTotal - currentYearUsed

    // Calculate banked points (sum of all members' bankedPoints)
    const bankedTotal = memberPoints.reduce((sum, member) => sum + Math.max(0, member.bankedPoints || 0), 0)
    const bankedUsed = Math.min(usedPoints - currentYearUsed, bankedTotal)
    const bankedAvailable = Math.max(0, bankedTotal - bankedUsed)

    // Create point breakdown
    const pointBreakdown = [
      {
        year: previousContractYear,
        status: "Banked" as const,
        total: bankedTotal,
        used: bankedUsed,
        available: bankedAvailable,
        contractYear: formatContractYearRange(previousContractYear - 1),
      },
      {
        year: currentContractYear,
        status: "Current" as const,
        total: currentYearTotal,
        used: currentYearUsed,
        available: currentYearAvailable,
        contractYear: formatContractYearRange(currentContractYear - 1),
      },
    ]

    return {
      totalPoints,
      availablePoints,
      usedPoints,
      pointBreakdown,
    }
  }

  /**
   * Gets all member points
   * @returns Array of member points
   */
  async getMemberPoints(): Promise<MemberPoints[]> {
    return this.memberRepository.getAll()
  }

  /**
   * Updates points after a stay is added or removed
   * @param stay The stay that was added or removed
   * @param action Whether the stay was added or removed
   * @returns Success status and message
   */
  async updatePointsAfterStayChange(
    stay: Stay,
    action: "add" | "remove",
  ): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const memberPoints = await this.memberRepository.getAll()

      const multiplier = action === "add" ? 1 : -1

      // Update member points
      for (const allocation of stay.allocation) {
        const memberIndex = memberPoints.findIndex((member) => member.name === allocation.member)
        if (memberIndex !== -1) {
          // First, update the banked points if they were used
          // This is the key change - we prioritize using banked points
          const pointsToDeduct = allocation.points * multiplier

          if (action === "add") {
            // When adding a stay, we prioritize using banked points
            const bankedPoints = memberPoints[memberIndex].bankedPoints || 0
            const currentYearPoints = memberPoints[memberIndex].currentYearPoints || 0

            // Determine how many points to take from banked vs current
            const bankedPointsUsed = Math.min(bankedPoints, pointsToDeduct)
            const currentPointsUsed = pointsToDeduct - bankedPointsUsed

            // Update the member's points
            memberPoints[memberIndex].bankedPoints = bankedPoints - bankedPointsUsed
            memberPoints[memberIndex].currentYearPoints = currentYearPoints - currentPointsUsed
          } else {
            // When removing a stay, we need to restore points
            // If we have borrowing info, use that to restore points correctly
            if (allocation.borrowedFrom && allocation.borrowedPoints) {
              // Restore borrowed points to the original lenders
              for (let i = 0; i < allocation.borrowedFrom.length; i++) {
                const lenderName = allocation.borrowedFrom[i]
                const pointsToReturn = allocation.borrowedPoints[i] || 0

                const lenderIndex = memberPoints.findIndex((m) => m.name === lenderName)
                if (lenderIndex !== -1) {
                  memberPoints[lenderIndex].bankedPoints =
                    (memberPoints[lenderIndex].bankedPoints || 0) + pointsToReturn
                }
              }

              // Restore current year points to the borrower
              const totalBorrowed = allocation.borrowedPoints.reduce((sum, pts) => sum + (pts || 0), 0)
              memberPoints[memberIndex].currentYearPoints =
                (memberPoints[memberIndex].currentYearPoints || 0) + totalBorrowed
            } else {
              // If no borrowing info, just add back to current year points
              memberPoints[memberIndex].currentYearPoints =
                (memberPoints[memberIndex].currentYearPoints || 0) + pointsToDeduct
            }
          }

          // Always update the total used and available
          memberPoints[memberIndex].used += allocation.points * multiplier
          memberPoints[memberIndex].available -= allocation.points * multiplier
        }
      }

      // Save the updated member points
      await this.memberRepository.updateAll(memberPoints)

      return {
        success: true,
        message: `Points updated successfully for ${action === "add" ? "new" : "removed"} stay`,
      }
    } catch (error) {
      console.error(`Error updating points after stay ${action}:`, error)
      return {
        success: false,
        message: `Failed to update points for ${action === "add" ? "new" : "removed"} stay`,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async fixNegativeBankedPoints(): Promise<boolean> {
    try {
      const memberPoints = await this.memberRepository.getAll()
      let updated = false

      for (const member of memberPoints) {
        if ((member.bankedPoints || 0) < 0) {
          console.log(`Fixing negative banked points for ${member.name}: ${member.bankedPoints}`)

          // Move the negative amount to current year points
          const negativeAmount = Math.abs(member.bankedPoints || 0)
          member.bankedPoints = 0
          member.currentYearPoints -= negativeAmount

          // Ensure we don't create negative current year points
          if (member.currentYearPoints < 0) {
            member.currentYearPoints = 0
          }

          // Recalculate total and available
          member.total = (member.currentYearPoints || 0) + (member.bankedPoints || 0)
          member.available = member.total - member.used + member.borrowed - member.lent

          updated = true
        }
      }

      if (updated) {
        await this.memberRepository.updateAll(memberPoints)
      }

      return updated
    } catch (error) {
      console.error("Error fixing negative banked points:", error)
      return false
    }
  }
}

