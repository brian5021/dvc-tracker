// Redis keys
export const KEYS = {
  POINT_SUMMARY: "dvc:point_summary",
  MEMBER_POINTS: "dvc:member_points",
  STAYS: "dvc:stays",
  TRANSFERS: "dvc:transfers",
  TRANSFER_LOGS: "dvc:transfer_logs",
  STAY_LOGS: "dvc:stay_logs",
  BANKING_LOGS: "dvc:banking_logs",
  EXPIRATION_LOGS: "dvc:expiration_logs",
  POINTS_DATABASE: "dvc:points_database",
}

// Default values
export const DEFAULT_POINT_SUMMARY = {
  totalPoints: 456,
  availablePoints: 456,
  usedPoints: 0,
  pointBreakdown: [
    { year: 2024, status: "Banked", total: 226, used: 0, available: 226, contractYear: "Sept 2023 - Aug 2024" },
    { year: 2025, status: "Current", total: 230, used: 0, available: 230, contractYear: "Sept 2024 - Aug 2025" },
  ],
}

export const DEFAULT_MEMBER_POINTS = [
  {
    name: "Brian",
    total: 152,
    used: 0,
    available: 152,
    borrowed: 0,
    lent: 0,
    color: "#1873cc",
    currentYearPoints: 77,
    bankedPoints: 75,
    pointsBeingBanked: 0,
    bankingDeadline: "2025-04-30",
    expirationDate: "2025-08-31",
  },
  {
    name: "Rachel",
    total: 152,
    used: 0,
    available: 152,
    borrowed: 0,
    lent: 0,
    color: "#6c5ce7",
    currentYearPoints: 77,
    bankedPoints: 75,
    pointsBeingBanked: 0,
    bankingDeadline: "2025-04-30",
    expirationDate: "2025-08-31",
  },
  {
    name: "Parents",
    total: 152,
    used: 0,
    available: 152,
    borrowed: 0,
    lent: 0,
    color: "#00b894",
    currentYearPoints: 76,
    bankedPoints: 76,
    pointsBeingBanked: 0,
    bankingDeadline: "2025-04-30",
    expirationDate: "2025-08-31",
  },
]

export const DEFAULT_STAYS = []

export const DEFAULT_TRANSFERS = []

export const DEFAULT_POINTS_DATABASE = {
  currentYearPoints: {
    total: 230,
    allocations: {
      Brian: 77,
      Rachel: 77,
      Parents: 76,
    },
    used: 0,
    available: 230,
  },
  bankedPoints: {
    total: 226,
    allocations: {
      Brian: 75,
      Rachel: 75,
      Parents: 76,
    },
    transactions: {},
    remainingAllocations: {
      Brian: 75,
      Rachel: 75,
      Parents: 76,
    },
    totalRemaining: 226,
  },
  borrowings: [],
}
