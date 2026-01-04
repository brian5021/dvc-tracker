import { redis } from "../redis-client"
import { KEYS, DEFAULT_STAYS } from "../constants"
import type { Stay, StayLogEntry } from "../models/stay"

export class StayRepository {
  /**
   * Gets all stays from Redis
   * @returns Array of stays
   */
  async getAll(): Promise<Stay[]> {
    try {
      // First check if the key exists
      const exists = await redis.exists(KEYS.STAYS)

      if (!exists) {
        // Initialize the data in Redis
        await redis.set(KEYS.STAYS, DEFAULT_STAYS)
        return DEFAULT_STAYS
      }

      // If the key exists, get the data
      const data = await redis.get(KEYS.STAYS)

      // Check if data is valid
      if (!data) {
        throw new Error("Redis returned empty data for existing key")
      }

      return data as Stay[]
    } catch (error) {
      console.error("Error getting stays:", error)
      // Return default data in case of error
      return DEFAULT_STAYS
    }
  }

  /**
   * Gets a stay by ID
   * @param id The stay ID
   * @returns The stay or null if not found
   */
  async getById(id: string): Promise<Stay | null> {
    const stays = await this.getAll()
    return stays.find((stay) => stay.id === id) || null
  }

  /**
   * Adds a new stay to Redis
   * @param stay The stay to add
   * @returns The added stay
   */
  async add(stay: Stay): Promise<Stay> {
    const stays = await this.getAll()
    const updatedStays = [...stays, stay]
    await redis.set(KEYS.STAYS, updatedStays)
    return stay
  }

  /**
   * Updates a stay in Redis
   * @param stay The stay to update
   * @returns True if successful, false otherwise
   */
  async update(stay: Stay): Promise<boolean> {
    try {
      const stays = await this.getAll()
      const index = stays.findIndex((s) => s.id === stay.id)

      if (index === -1) {
        return false
      }

      stays[index] = stay
      await redis.set(KEYS.STAYS, stays)
      return true
    } catch (error) {
      console.error("Error updating stay:", error)
      return false
    }
  }

  /**
   * Deletes a stay from Redis
   * @param id The ID of the stay to delete
   * @returns True if successful, false otherwise
   */
  async delete(id: string): Promise<boolean> {
    try {
      const stays = await this.getAll()
      const index = stays.findIndex((stay) => stay.id === id)

      if (index === -1) {
        return false
      }

      stays.splice(index, 1)
      await redis.set(KEYS.STAYS, stays)
      return true
    } catch (error) {
      console.error("Error deleting stay:", error)
      return false
    }
  }

  /**
   * Logs a stay action for audit purposes
   * @param logEntry The log entry to add
   */
  async logAction(logEntry: StayLogEntry): Promise<void> {
    try {
      const logs = (await redis.get(KEYS.STAY_LOGS)) || []
      logs.push(logEntry)
      await redis.set(KEYS.STAY_LOGS, logs)
    } catch (error) {
      console.error("Error logging stay action:", error)
      // Don't throw - logging should not block the main operation
    }
  }

  /**
   * Gets all stay logs
   * @returns Array of stay log entries
   */
  async getLogs(): Promise<StayLogEntry[]> {
    try {
      return (await redis.get(KEYS.STAY_LOGS)) || []
    } catch (error) {
      console.error("Error getting stay logs:", error)
      return []
    }
  }
}
