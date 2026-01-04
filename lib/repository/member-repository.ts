import { redis } from "../redis-client"
import { KEYS, DEFAULT_MEMBER_POINTS } from "../constants"
import type { MemberPoints } from "../models/member"
import { safeRedisOperation } from "../utils/error-handling"

export class MemberRepository {
  /**
   * Gets all member points from Redis
   * @returns Array of member points
   */
  async getAll(): Promise<MemberPoints[]> {
    try {
      console.log("[v0] MemberRepository.getAll - Starting")
      console.log("[v0] Redis client:", !!redis)
      console.log("[v0] KEYS.MEMBER_POINTS:", KEYS.MEMBER_POINTS)

      // First check if the key exists
      const exists = await redis.exists(KEYS.MEMBER_POINTS)
      console.log("[v0] Key exists:", exists)

      if (!exists) {
        console.log("[v0] Initializing with default member points")
        // Initialize the data in Redis
        await redis.set(KEYS.MEMBER_POINTS, DEFAULT_MEMBER_POINTS)
        return DEFAULT_MEMBER_POINTS
      }

      // If the key exists, get the data
      console.log("[v0] Fetching member points from Redis")
      const data = await redis.get(KEYS.MEMBER_POINTS)
      console.log("[v0] Data fetched:", !!data)

      // Check if data is valid
      if (!data) {
        throw new Error("Redis returned empty data for existing key")
      }

      return data as MemberPoints[]
    } catch (error) {
      console.error("[v0] Error getting member points:", error)
      console.error("[v0] Error details:", error instanceof Error ? error.message : String(error))
      console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack")
      // Return default data in case of error
      return DEFAULT_MEMBER_POINTS
    }
  }

  /**
   * Updates all member points in Redis
   * @param data Array of member points to update
   */
  async updateAll(data: MemberPoints[]): Promise<void> {
    await safeRedisOperation(() => redis.set(KEYS.MEMBER_POINTS, data), undefined, "Error updating member points")
  }

  /**
   * Gets a member by name
   * @param name The member name
   * @returns The member points or null if not found
   */
  async getByName(name: string): Promise<MemberPoints | null> {
    const members = await this.getAll()
    return members.find((member) => member.name === name) || null
  }

  /**
   * Updates a single member's points
   * @param updatedMember The updated member points
   * @returns True if successful, false otherwise
   */
  async updateMember(updatedMember: MemberPoints): Promise<boolean> {
    try {
      const members = await this.getAll()
      const index = members.findIndex((m) => m.name === updatedMember.name)

      if (index === -1) {
        return false
      }

      members[index] = updatedMember
      await this.updateAll(members)
      return true
    } catch (error) {
      console.error("Error updating member:", error)
      return false
    }
  }
}
