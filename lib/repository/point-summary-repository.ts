import type { PointSummary } from "../models/point-allocation"
import type { MemberRepository } from "./member-repository"
import { PointService } from "../services/point-service"
import { MemberRepository as DefaultMemberRepository } from "./member-repository"

export class PointSummaryRepository {
  private memberRepository: MemberRepository
  private pointService: PointService | null = null

  constructor(memberRepository?: MemberRepository) {
    this.memberRepository = memberRepository || new DefaultMemberRepository()
  }

  /**
   * Gets the point summary by calculating it from member points
   * @returns The calculated point summary
   */
  async get(): Promise<PointSummary> {
    // Initialize pointService if not already done
    if (!this.pointService) {
      this.pointService = new PointService(this, this.memberRepository)
    }

    // Get all member points
    const memberPoints = await this.memberRepository.getAll()

    // Calculate the point summary from member points
    return this.pointService.calculatePointSummary(memberPoints)
  }

  /**
   * This method is kept for backward compatibility but doesn't actually store data
   * @param data The point summary data (ignored)
   */
  async update(data: PointSummary): Promise<void> {
    // This method is kept for backward compatibility but doesn't do anything
    console.log("PointSummaryRepository.update is deprecated and has no effect")
  }
}

