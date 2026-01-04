import type { MemberRepository } from "../repository/member-repository"
import type { PointSummaryRepository } from "../repository/point-summary-repository"
import type { BankingResult, ExpirationResult } from "../models/point-allocation"
import type { Member } from "../models/member"
import { generateTransactionId } from "../utils/transaction-utils"
import { isPastBankingDeadline, isPointExpirationDate, isContractRolloverDate } from "../utils/date-utils"
import { createErrorResult } from "../utils/error-handling"
import { redis } from "../redis-client"
import { KEYS } from "../constants"

export class BankingService {
  private memberRepository: MemberRepository
  private pointSummaryRepository: PointSummaryRepository

  constructor(memberRepository: MemberRepository, pointSummaryRepository: PointSummaryRepository) {
    this.memberRepository = memberRepository
    this.pointSummaryRepository = pointSummaryRepository
  }

  /**
   * Banks points for a member before the April 30th deadline
   * @param memberName The member's name
   * @param pointsToBankCount The number of points to bank
   * @returns Result of the operation
   */
  async bankPoints(memberName: Member, pointsToBankCount: number): Promise<BankingResult> {
    try {
      // Get current member points
      const memberPoints = await this.memberRepository.getAll()
      const memberIndex = memberPoints.findIndex((m) => m.name === memberName)

      if (memberIndex === -1) {
        return createErrorResult<BankingResult>(`Member ${memberName} not found`, null, {
          memberName,
          pointsBanked: 0,
          availableNextYear: false,
        })
      }

      const member = memberPoints[memberIndex]

      // Check if we're past the banking deadline (April 30)
      if (isPastBankingDeadline()) {
        const currentYear = new Date().getFullYear()
        return createErrorResult<BankingResult>(`Banking deadline (April 30) has passed for ${currentYear}`, null, {
          memberName,
          pointsBanked: 0,
          availableNextYear: false,
        })
      }

      // Check if member has enough current year points to bank
      if (member.currentYearPoints < pointsToBankCount) {
        return createErrorResult<BankingResult>(
          `Not enough current year points to bank. Available: ${member.currentYearPoints}`,
          null,
          { memberName, pointsBanked: 0, availableNextYear: false },
        )
      }

      // Update member points
      // IMPORTANT: When banking points, they are removed from currentYearPoints
      // but they are NOT added to available points until the next contract year
      member.currentYearPoints -= pointsToBankCount

      // Instead, they go into a separate tracking field
      member.pointsBeingBanked = (member.pointsBeingBanked || 0) + pointsToBankCount

      // The available points actually decrease when banking current year points
      member.available -= pointsToBankCount

      // Update in Redis
      await this.memberRepository.updateAll(memberPoints)

      // Log the banking transaction
      await this.logBankingAction({
        memberName,
        pointsBanked: pointsToBankCount,
        bankingDate: new Date().toISOString(),
        nextYearBanked: (new Date().getFullYear() + 1).toString(),
        transactionId: generateTransactionId(),
      })

      const currentYear = new Date().getFullYear()
      return {
        success: true,
        message: `Successfully banked ${pointsToBankCount} points for use starting September 1, ${currentYear}`,
        memberName,
        pointsBanked: pointsToBankCount,
        availableNextYear: true,
      }
    } catch (error) {
      console.error("Error banking points:", error)
      return createErrorResult<BankingResult>("An unexpected error occurred", error, {
        memberName,
        pointsBanked: 0,
        availableNextYear: false,
      })
    }
  }

  /**
   * Processes the yearly contract rollover (September 1st)
   * @returns True if successful, false otherwise
   */
  async processContractYearRollover(): Promise<boolean> {
    try {
      // Only process on September 1st
      if (!isContractRolloverDate()) {
        console.log("Contract year rollover only occurs on September 1st")
        return false
      }

      // Get current member points
      const memberPoints = await this.memberRepository.getAll()
      const currentYear = new Date().getFullYear()

      // Process for each member
      for (const member of memberPoints) {
        // Any points being banked now become available banked points
        if (member.pointsBeingBanked > 0) {
          member.bankedPoints += member.pointsBeingBanked
          member.available += member.pointsBeingBanked
          member.pointsBeingBanked = 0
        }

        // Reset current year points to the standard allocation
        // This would need to be configured based on your contract
        const standardAllocation = 76 // Example: 76 points per member per year
        member.currentYearPoints = standardAllocation
        member.available += standardAllocation
        member.total = member.currentYearPoints + member.bankedPoints
      }

      // Update Redis
      await this.memberRepository.updateAll(memberPoints)

      return true
    } catch (error) {
      console.error("Error processing contract year rollover:", error)
      return false
    }
  }

  /**
   * Processes expired points on August 31st
   * @returns Array of expiration results
   */
  async processExpiredPoints(): Promise<ExpirationResult[]> {
    try {
      // Get current member points
      const memberPoints = await this.memberRepository.getAll()
      const results: ExpirationResult[] = []
      const currentYear = new Date().getFullYear()

      // Only process if it's August 31st
      if (!isPointExpirationDate()) {
        return [
          {
            success: false,
            message: "Point expiration only occurs on August 31st",
            memberName: "Brian", // Default member
            pointsExpired: 0,
          },
        ]
      }

      // Process each member
      for (const member of memberPoints) {
        // Calculate points that will expire (unused current year points)
        const pointsToExpire = member.currentYearPoints

        if (pointsToExpire > 0) {
          // Update member points
          member.currentYearPoints = 0 // Reset current year points
          member.available -= pointsToExpire

          // Log the expiration
          await this.logExpirationAction({
            memberName: member.name,
            pointsExpired: pointsToExpire,
            expirationDate: new Date().toISOString(),
            yearExpired: currentYear.toString(),
            transactionId: generateTransactionId(),
          })

          results.push({
            success: true,
            message: `${pointsToExpire} points expired for ${member.name}`,
            memberName: member.name,
            pointsExpired: pointsToExpire,
          })
        } else {
          results.push({
            success: true,
            message: `No points expired for ${member.name}`,
            memberName: member.name,
            pointsExpired: 0,
          })
        }
      }

      // Update all member points in Redis
      await this.memberRepository.updateAll(memberPoints)

      return results
    } catch (error) {
      console.error("Error processing expired points:", error)
      return [
        {
          success: false,
          message: "An unexpected error occurred",
          memberName: "Brian", // Default member
          pointsExpired: 0,
          error: error instanceof Error ? error.message : String(error),
        },
      ]
    }
  }

  /**
   * Logs a banking action
   * @param logEntry The log entry
   */
  private async logBankingAction(logEntry: {
    memberName: Member
    pointsBanked: number
    bankingDate: string
    nextYearBanked: string
    transactionId: string
  }): Promise<void> {
    try {
      const logs = (await redis.get(KEYS.BANKING_LOGS)) || []
      logs.push({
        ...logEntry,
        timestamp: Date.now(),
      })
      await redis.set(KEYS.BANKING_LOGS, logs)
    } catch (error) {
      console.error("Error logging banking action:", error)
    }
  }

  /**
   * Logs an expiration action
   * @param logEntry The log entry
   */
  private async logExpirationAction(logEntry: {
    memberName: Member
    pointsExpired: number
    expirationDate: string
    yearExpired: string
    transactionId: string
  }): Promise<void> {
    try {
      const logs = (await redis.get(KEYS.EXPIRATION_LOGS)) || []
      logs.push({
        ...logEntry,
        timestamp: Date.now(),
      })
      await redis.set(KEYS.EXPIRATION_LOGS, logs)
    } catch (error) {
      console.error("Error logging expiration action:", error)
    }
  }
}

