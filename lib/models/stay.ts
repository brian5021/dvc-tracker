import type { Member } from "./member"

export interface Stay {
  id: string
  resort: string
  dates: string
  nights: number
  points: number
  status: "Planning" | "Waitlisted" | "Confirmed" | "Completed" | "Cancelled"
  allocation: {
    member: Member
    points: number
    borrowedFrom?: Member[] // Added to track which members provided banked points
    borrowedPoints?: number[] // Added to track how many points were borrowed from each member
  }[]
  checkIn: string
  checkOut: string
  roomType: string
  createdAt: number
  transactionId: string
}

export interface StayResult {
  success: boolean
  message: string
  stay?: Stay
  error?: string
}

export interface StayLogEntry {
  transactionId: string
  action: "create" | "update" | "delete"
  stay: Stay
  timestamp: number
  previousState?: Stay
}
