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

export interface PointSummary {
  totalPoints: number
  availablePoints: number
  usedPoints: number
  pointBreakdown: PointAllocation[]
}

export interface PointYearData {
  total: number
  allocations: Record<string, number>
  used: number
  available: number
}

export interface BookingTransaction {
  stay: string
  pointsUsed: number
  details: Record<
    string,
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
  allocations: Record<string, number>
  transactions: {
    booking: BookingTransaction
  }
  remainingAllocations: Record<string, number>
  totalRemaining: number
}

export interface BorrowingTransaction {
  transactionId: string
  date: string
  lender: string
  borrowers: Record<string, number>
  totalBorrowed: number
}

export interface PointsDatabase {
  currentYearPoints: PointYearData
  bankedPoints: BankedPointsData
  borrowings: BorrowingTransaction[]
}

export interface BankingResult {
  success: boolean
  message: string
  memberName: string
  pointsBanked: number
  error?: string
  // Add new field to indicate if points are immediately available or not
  availableNextYear: boolean
}

export interface ExpirationResult {
  success: boolean
  message: string
  memberName: string
  pointsExpired: number
  error?: string
}
