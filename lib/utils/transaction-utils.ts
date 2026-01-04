/**
 * Generates a unique transaction ID for security tracking
 * @returns A unique transaction ID
 */
export function generateTransactionId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

