export type Member = "Brian" | "Rachel" | "Parents"

export interface PointAllocation {
  year: number
  total: number
  used: number
  available: number
  banked?: number
  borrowed?: number
  status?: "Current" | "Banked" | "Expired"
  contractYear?: string // Add this field to store the contract year range
}

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
  // New field to track points being banked this year (unavailable until next year)
  pointsBeingBanked: number // Points banked this year that will be available next year
  // New fields to track banking and expiration
  bankingDeadline?: string // Date by which points must be banked (April 30)
  expirationDate?: string // Date by which points expire if not used (August 31)
}

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
    borrowedFrom?: Member
    borrowedPoints?: number
  }[]
  checkIn: string
  checkOut: string
  roomType: string
  createdAt: number
  transactionId: string
}

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

export interface StayResult {
  success: boolean
  message: string
  stay?: Stay
  error?: string
}

export interface BankingResult {
  success: boolean
  message: string
  memberName: Member
  pointsBanked: number
  error?: string
  // Add new field to indicate if points are immediately available or not
  availableNextYear: boolean
}

export interface ExpirationResult {
  success: boolean
  message: string
  memberName: Member
  pointsExpired: number
  error?: string
}

export interface PointAlert {
  id: string
  type: "BankingDeadline" | "PointExpiration" | "RepaymentDue"
  memberName: Member
  message: string
  dueDate: string
  pointsAffected: number
  isRead: boolean
  createdAt: number
}

// New interfaces to match the provided structure
export interface PointYearData {
  total: number
  allocations: Record<Member, number>
  used: number
  available: number
}

export interface BookingTransaction {
  stay: string
  pointsUsed: number
  details: Record<
    Member,
    {
      pointsUsed?: number
      borrowedFromBrian?: number
      borrowedFromRachel?: number
      borrowedFromParents?: number
      lent?: number
    }
  >
  date: string
}

export interface BankedPointsData {
  total: number
  allocations: Record<Member, number>
  transactions: {
    booking: BookingTransaction
  }
  remainingAllocations: Record<Member, number>
  totalRemaining: number
}

export interface BorrowingTransaction {
  transactionId: string
  date: string
  lender: Member
  borrowers: Record<Member, number>
  totalBorrowed: number
}

export interface PointsDatabase {
  currentYearPoints: PointYearData
  bankedPoints: BankedPointsData
  borrowings: BorrowingTransaction[]
}
