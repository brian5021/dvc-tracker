export type Member = "Brian" | "Rachel" | "Parents"

export interface MemberPoints {
  name: Member
  total: number
  used: number
  available: number
  borrowed: number
  lent: number
  color: string
  currentYearPoints: number // Points allocated for current year
  bankedPoints: number // Points banked from previous year that are available now
  pointsBeingBanked: number // Points banked this year that will be available next year
  // New fields to track banking and expiration
  bankingDeadline?: string // Date by which points must be banked (April 30)
  expirationDate?: string // Date by which points expire if not used (August 31)
}

