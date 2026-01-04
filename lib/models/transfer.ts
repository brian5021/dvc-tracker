import type { Member } from "./member"

export interface PointTransfer {
  id: string
  fromMember: Member
  toMember: Member
  points: number
  useYear: string
  transferDate: string
  returnDate: string // When the points should be returned
  status: "Active" | "Returned"
  notes?: string
  createdAt: number
  transactionId: string
  // New fields for repayment tracking
  repaymentYear?: string // The year when points should be repaid
  repaymentStatus?: "Scheduled" | "Completed" | "Overdue"
}

export interface TransferResult {
  success: boolean
  message: string
  transfer?: PointTransfer
  error?: string
}

export interface TransferLogEntry {
  transactionId: string
  action: "create" | "update" | "delete"
  transfer: PointTransfer
  timestamp: number
  previousStatus?: string
}
