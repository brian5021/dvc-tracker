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
      // First check if the key exists
      const exists = await redis.exists(KEYS.MEMBER_POINTS)

      if (!exists) {
        // Initialize the data in Redis
        await redis.set(KEYS.MEMBER_POINTS, DEFAULT_MEMBER_POINTS)
        return DEFAULT_MEMBER_POINTS
      }

      // If the key exists, get the data
      const data = await redis.get(KEYS.MEMBER_POINTS)

      // Check if data is valid
      if (!data) {
        throw new Error("Redis returned empty data for existing key")
      }

      return data as MemberPoints[]
    } catch (error) {
      console.error("Error getting member points:", error)
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

