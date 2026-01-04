import { redis } from "../redis-client"
import { KEYS, DEFAULT_TRANSFERS } from "../constants"
import type { PointTransfer, TransferLogEntry } from "../models/transfer"

export class TransferRepository {
  /**
   * Gets all transfers from Redis
   * @returns Array of transfers
   */
  async getAll(): Promise<PointTransfer[]> {
    try {
      console.log("[v0] TransferRepository.getAll - Starting")
      console.log("[v0] Redis client:", !!redis)
      console.log("[v0] KEYS.TRANSFERS:", KEYS.TRANSFERS)

      // First check if the key exists
      const exists = await redis.exists(KEYS.TRANSFERS)
      console.log("[v0] Key exists:", exists)

      if (!exists) {
        console.log("[v0] Initializing with default transfers")
        // Initialize the data in Redis
        await redis.set(KEYS.TRANSFERS, DEFAULT_TRANSFERS)
        return DEFAULT_TRANSFERS
      }

      // If the key exists, get the data
      console.log("[v0] Fetching transfers from Redis")
      const data = await redis.get(KEYS.TRANSFERS)
      console.log("[v0] Data fetched:", !!data)

      // Check if data is valid
      if (!data) {
        throw new Error("Redis returned empty data for existing key")
      }

      return data as PointTransfer[]
    } catch (error) {
      console.error("[v0] Error getting transfers:", error)
      console.error("[v0] Error details:", error instanceof Error ? error.message : String(error))
      console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack")
      // Return default data in case of error
      return DEFAULT_TRANSFERS
    }
  }

  /**
   * Gets a transfer by ID
   * @param id The transfer ID
   * @returns The transfer or null if not found
   */
  async getById(id: string): Promise<PointTransfer | null> {
    const transfers = await this.getAll()
    return transfers.find((transfer) => transfer.id === id) || null
  }

  /**
   * Adds a new transfer to Redis
   * @param transfer The transfer to add
   * @returns The added transfer
   */
  async add(transfer: PointTransfer): Promise<PointTransfer> {
    const transfers = await this.getAll()
    const updatedTransfers = [...transfers, transfer]
    await redis.set(KEYS.TRANSFERS, JSON.stringify(updatedTransfers))
    return transfer
  }

  /**
   * Updates a transfer in Redis
   * @param transfer The transfer to update
   * @returns True if successful, false otherwise
   */
  async update(transfer: PointTransfer): Promise<boolean> {
    try {
      const transfers = await this.getAll()
      const index = transfers.findIndex((t) => t.id === transfer.id)

      if (index === -1) {
        return false
      }

      transfers[index] = transfer
      await redis.set(KEYS.TRANSFERS, JSON.stringify(transfers))
      return true
    } catch (error) {
      console.error("Error updating transfer:", error)
      return false
    }
  }

  /**
   * Logs a transfer action for audit purposes
   * @param logEntry The log entry to add
   */
  async logAction(logEntry: TransferLogEntry): Promise<void> {
    try {
      const logs = (await redis.get(KEYS.TRANSFER_LOGS)) || []
      logs.push(logEntry)
      await redis.set(KEYS.TRANSFER_LOGS, JSON.stringify(logs))
    } catch (error) {
      console.error("Error logging transfer action:", error)
      // Don't throw - logging should not block the main operation
    }
  }

  /**
   * Gets all transfer logs
   * @returns Array of transfer log entries
   */
  async getLogs(): Promise<TransferLogEntry[]> {
    try {
      const logs = await redis.get(KEYS.TRANSFER_LOGS)
      return logs ? JSON.parse(logs) : []
    } catch (error) {
      console.error("Error getting transfer logs:", error)
      return []
    }
  }
}
