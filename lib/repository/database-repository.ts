import { redis } from "../redis-client"
import { KEYS, DEFAULT_POINTS_DATABASE, DEFAULT_MEMBER_POINTS, DEFAULT_STAYS, DEFAULT_TRANSFERS } from "../constants"
import type { PointsDatabase } from "../models/point-allocation"

export class DatabaseRepository {
  /**
   * Gets the points database from Redis
   * @returns The points database or null if not found
   */
  async get(): Promise<PointsDatabase | null> {
    try {
      const exists = await redis.exists(KEYS.POINTS_DATABASE)

      if (!exists) {
        // Initialize the database if it doesn't exist
        await this.initialize()
      }

      const data = await redis.get(KEYS.POINTS_DATABASE)
      return data as PointsDatabase
    } catch (error) {
      console.error("Error getting points database:", error)
      return null
    }
  }

  /**
   * Initializes the database with default values
   * @returns True if successful, false otherwise
   */
  async initialize(): Promise<boolean> {
    try {
      // Get current contract year
      const currentDate = new Date()
      const currentYear = currentDate.getFullYear()
      const currentMonth = currentDate.getMonth()

      // Calculate contract year (Sept-Aug)
      const contractYear = currentMonth >= 8 ? currentYear + 1 : currentYear
      const previousContractYear = contractYear - 1

      // Update DEFAULT_POINTS_DATABASE with correct years
      const updatedDatabase = {
        ...DEFAULT_POINTS_DATABASE,
        currentYearPoints: {
          ...DEFAULT_POINTS_DATABASE.currentYearPoints,
          contractYear: `Sept ${contractYear - 1} - Aug ${contractYear}`,
        },
        bankedPoints: {
          ...DEFAULT_POINTS_DATABASE.bankedPoints,
          contractYear: `Sept ${previousContractYear - 1} - Aug ${previousContractYear}`,
        },
      }

      // Update DEFAULT_MEMBER_POINTS with correct years
      const updatedMemberPoints = DEFAULT_MEMBER_POINTS.map((member) => ({
        ...member,
        bankingDeadline: `${contractYear}-04-30`,
        expirationDate: `${contractYear}-08-31`,
      }))

      // Set up all the database keys with updated values
      await redis.set(KEYS.POINTS_DATABASE, updatedDatabase)
      await redis.set(KEYS.MEMBER_POINTS, updatedMemberPoints)
      await redis.set(KEYS.STAYS, DEFAULT_STAYS)
      await redis.set(KEYS.TRANSFERS, DEFAULT_TRANSFERS)

      // Clear all logs as well
      await redis.set(KEYS.TRANSFER_LOGS, [])
      await redis.set(KEYS.STAY_LOGS, [])
      await redis.set(KEYS.BANKING_LOGS, [])
      await redis.set(KEYS.EXPIRATION_LOGS, [])

      return true
    } catch (error) {
      console.error("Error initializing database:", error)
      return false
    }
  }

  /**
   * Tests the Redis connection
   * @returns Connection status information
   */
  async testConnection(): Promise<{
    success: boolean
    url?: string
    readOnly?: boolean
    keysCount?: number
    error?: string
  }> {
    try {
      // Check if we can connect to Redis
      const ping = await redis.ping()

      if (ping !== "PONG") {
        return {
          success: false,
          error: "Failed to ping Redis server",
        }
      }

      // Get the number of keys in the database
      const keysCount = await redis.dbsize()

      // Determine if we're using read-only mode
      const readOnly = !process.env.KV_REST_API_TOKEN && !!process.env.KV_REST_API_READ_ONLY_TOKEN

      // Return connection details
      return {
        success: true,
        url: process.env.KV_URL || process.env.REDIS_URL || process.env.KV_REST_API_URL,
        readOnly,
        keysCount,
      }
    } catch (error) {
      console.error("Redis connection test failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error connecting to Redis",
      }
    }
  }

  /**
   * Gets database statistics
   * @returns Database statistics
   */
  async getStats(): Promise<{
    keys: string[]
    totalSize: number
    keyDetails: Record<string, { size: number; type: string }>
  }> {
    try {
      // Get all keys
      const keys = await redis.keys("*")

      // Get details for each key
      const keyDetails: Record<string, { size: number; type: string }> = {}
      let totalSize = 0

      for (const key of keys) {
        // Get the type of the key
        const type = await redis.type(key)

        // Get the size of the key
        let size = 0

        if (type === "string") {
          const value = await redis.get(key)
          size = JSON.stringify(value).length
        } else if (type === "list") {
          const values = await redis.lrange(key, 0, -1)
          size = JSON.stringify(values).length
        } else if (type === "hash") {
          const values = await redis.hgetall(key)
          size = JSON.stringify(values).length
        } else if (type === "set") {
          const values = await redis.smembers(key)
          size = JSON.stringify(values).length
        } else if (type === "zset") {
          const values = await redis.zrange(key, 0, -1, { withScores: true })
          size = JSON.stringify(values).length
        }

        keyDetails[key] = { size, type }
        totalSize += size
      }

      return {
        keys,
        totalSize,
        keyDetails,
      }
    } catch (error) {
      console.error("Error getting database stats:", error)
      throw error
    }
  }
}
