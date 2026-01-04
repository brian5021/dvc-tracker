import { Redis } from "@upstash/redis"

// Initialize Redis client using the appropriate environment variables
// The Upstash Redis client requires REST API URL and token, not the Redis protocol URL
const redis = new Redis({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
})

// Data models
export type Member = "Brian" | "Rachel" | "Parents"

export interface PointAllocation {
  year: number
  total: number
  used: number
  available: number
  banked?: number
  borrowed?: number
}

export interface MemberPoints {
  name: Member
  total: number
  used: number
  available: number
  borrowed: number
  lent: number
  color: string
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
  returnDate: string
  status: "Active" | "Returned"
  notes?: string
  createdAt: number
  transactionId: string // Added for security tracking
}

export interface TransferResult {
  success: boolean
  message: string
  transfer?: PointTransfer
  error?: string
}

// Add this interface for stay validation results
export interface StayResult {
  success: boolean
  message: string
  stay?: Stay
  error?: string
}

// Redis keys
const KEYS = {
  POINT_SUMMARY: "dvc:point_summary",
  MEMBER_POINTS: "dvc:member_points",
  STAYS: "dvc:stays",
  TRANSFERS: "dvc:transfers",
  TRANSFER_LOGS: "dvc:transfer_logs", // Added for audit trail
  STAY_LOGS: "dvc:stay_logs",
}

// Enhanced helper function to safely execute Redis operations with retry logic
async function safeRedisOperation<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  errorMessage: string,
  retryCount = 3,
): Promise<T> {
  let attempts = 0

  while (attempts < retryCount) {
    try {
      return await operation()
    } catch (error) {
      attempts++
      console.error(`${errorMessage} (Attempt ${attempts}/${retryCount}):`, error)

      if (attempts >= retryCount) {
        // Log to monitoring system
        console.error(`Operation failed after ${retryCount} attempts: ${errorMessage}`)
        return defaultValue
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempts - 1)))
    }
  }

  return defaultValue
}

// Point summary functions
export async function getPointSummary(): Promise<{
  totalPoints: number
  availablePoints: number
  usedPoints: number
  pointBreakdown: PointAllocation[]
}> {
  try {
    // First check if the key exists
    const exists = await redis.exists(KEYS.POINT_SUMMARY)

    if (!exists) {
      // Default data if nothing exists yet
      const defaultData = {
        totalPoints: 456,
        availablePoints: 325,
        usedPoints: 131,
        pointBreakdown: [
          { year: 2023, status: "Banked", total: 226, used: 131, available: 95 },
          { year: 2024, status: "Current", total: 230, used: 0, available: 230 },
        ],
      }

      // Initialize the data in Redis
      await redis.set(KEYS.POINT_SUMMARY, defaultData)
      return defaultData
    }

    // If the key exists, get the data
    const data = await redis.get(KEYS.POINT_SUMMARY)

    // Check if data is valid
    if (!data) {
      throw new Error("Redis returned empty data for existing key")
    }

    return data as any
  } catch (error) {
    console.error("Error getting point summary:", error)
    // Return default data in case of error
    return {
      totalPoints: 456,
      availablePoints: 325,
      usedPoints: 131,
      pointBreakdown: [
        { year: 2023, status: "Banked", total: 226, used: 131, available: 95 },
        { year: 2024, status: "Current", total: 230, used: 0, available: 230 },
      ],
    }
  }
}

export async function updatePointSummary(data: any): Promise<void> {
  await safeRedisOperation(() => redis.set(KEYS.POINT_SUMMARY, data), undefined, "Error updating point summary")
}

// Member points functions
export async function getMemberPoints(): Promise<MemberPoints[]> {
  try {
    // First check if the key exists
    const exists = await redis.exists(KEYS.MEMBER_POINTS)

    if (!exists) {
      // Default data if nothing exists yet
      const defaultData = [
        {
          name: "Brian",
          total: 152,
          used: 50,
          available: 102,
          borrowed: 15,
          lent: 25,
          color: "#1873cc",
        },
        {
          name: "Rachel",
          total: 152,
          used: 30,
          available: 122,
          borrowed: 25,
          lent: 10,
          color: "#6c5ce7",
        },
        {
          name: "Parents",
          total: 152,
          used: 51,
          available: 101,
          borrowed: 0,
          lent: 15,
          color: "#00b894",
        },
      ]

      // Initialize the data in Redis
      await redis.set(KEYS.MEMBER_POINTS, defaultData)
      return defaultData
    }

    // If the key exists, get the data
    const data = await redis.get(KEYS.MEMBER_POINTS)

    // Check if data is valid
    if (!data) {
      throw new Error("Redis returned empty data for existing key")
    }

    return data as MemberPoints[]
  } catch (error) {
    console.error("Error getting member points:", error)
    // Return default data in case of error
    return [
      {
        name: "Brian",
        total: 152,
        used: 50,
        available: 102,
        borrowed: 15,
        lent: 25,
        color: "#1873cc",
      },
      {
        name: "Rachel",
        total: 152,
        used: 30,
        available: 122,
        borrowed: 25,
        lent: 10,
        color: "#6c5ce7",
      },
      {
        name: "Parents",
        total: 152,
        used: 51,
        available: 101,
        borrowed: 0,
        lent: 15,
        color: "#00b894",
      },
    ]
  }
}

export async function updateMemberPoints(data: MemberPoints[]): Promise<void> {
  await safeRedisOperation(() => redis.set(KEYS.MEMBER_POINTS, data), undefined, "Error updating member points")
}

// Stays functions
export async function getStays(): Promise<Stay[]> {
  try {
    // First check if the key exists
    const exists = await redis.exists(KEYS.STAYS)

    if (!exists) {
      // Default data if nothing exists yet
      const defaultData = [
        {
          id: "stay1",
          resort: "Disney's Polynesian Villas & Bungalows",
          dates: "June 10-15, 2024",
          nights: 5,
          points: 76,
          status: "Confirmed",
          allocation: [
            { member: "Brian", points: 25 },
            { member: "Rachel", points: 25 },
            { member: "Parents", points: 26 },
          ],
          checkIn: "2024-06-10",
          checkOut: "2024-06-15",
          roomType: "studio",
          createdAt: Date.now(),
          transactionId: generateTransactionId(),
        },
        {
          id: "stay2",
          resort: "Disney's Beach Club Villas",
          dates: "December 20-27, 2024",
          nights: 7,
          points: 105,
          status: "Waitlisted",
          allocation: [
            { member: "Brian", points: 35 },
            { member: "Rachel", points: 35 },
            { member: "Parents", points: 35 },
          ],
          checkIn: "2024-12-20",
          checkOut: "2024-12-27",
          roomType: "one_bedroom",
          createdAt: Date.now(),
          transactionId: generateTransactionId(),
        },
        {
          id: "stay3",
          resort: "Disney's Animal Kingdom Villas - Kidani Village",
          dates: "March 5-10, 2024",
          nights: 5,
          points: 55,
          status: "Completed",
          allocation: [
            { member: "Brian", points: 25 },
            { member: "Rachel", points: 5 },
            { member: "Parents", points: 25 },
          ],
          checkIn: "2024-03-05",
          checkOut: "2024-03-10",
          roomType: "studio",
          createdAt: Date.now(),
          transactionId: generateTransactionId(),
        },
      ]

      // Initialize the data in Redis
      await redis.set(KEYS.STAYS, defaultData)
      return defaultData
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
    return [
      {
        id: "stay1",
        resort: "Disney's Polynesian Villas & Bungalows",
        dates: "June 10-15, 2024",
        nights: 5,
        points: 76,
        status: "Confirmed",
        allocation: [
          { member: "Brian", points: 25 },
          { member: "Rachel", points: 25 },
          { member: "Parents", points: 26 },
        ],
        checkIn: "2024-06-10",
        checkOut: "2024-06-15",
        roomType: "studio",
        createdAt: Date.now(),
        transactionId: generateTransactionId(),
      },
      {
        id: "stay2",
        resort: "Disney's Beach Club Villas",
        dates: "December 20-27, 2024",
        nights: 7,
        points: 105,
        status: "Waitlisted",
        allocation: [
          { member: "Brian", points: 35 },
          { member: "Rachel", points: 35 },
          { member: "Parents", points: 35 },
        ],
        checkIn: "2024-12-20",
        checkOut: "2024-12-27",
        roomType: "one_bedroom",
        createdAt: Date.now(),
        transactionId: generateTransactionId(),
      },
      {
        id: "stay3",
        resort: "Disney's Animal Kingdom Villas - Kidani Village",
        dates: "March 5-10, 2024",
        nights: 5,
        points: 55,
        status: "Completed",
        allocation: [
          { member: "Brian", points: 25 },
          { member: "Rachel", points: 5 },
          { member: "Parents", points: 25 },
        ],
        checkIn: "2024-03-05",
        checkOut: "2024-03-10",
        roomType: "studio",
        createdAt: Date.now(),
        transactionId: generateTransactionId(),
      },
    ]
  }
}

// Update the addStay function with better validation and security
export async function addStay(stay: Omit<Stay, "id" | "createdAt">): Promise<StayResult> {
  try {
    // Validate the stay before adding
    const validationResult = await validateStay(stay)
    if (!validationResult.success) {
      return validationResult
    }

    const stays = await getStays()

    // Generate a unique transaction ID for security tracking
    const transactionId = generateTransactionId()

    const newStay: Stay = {
      ...stay,
      id: `stay${Date.now()}`,
      createdAt: Date.now(),
      transactionId, // Add transaction ID for tracking
    }

    const updatedStays = [...stays, newStay]

    // Update point allocations - this is now a separate transaction
    const updateResult = await updatePointsAfterStayChange(newStay, "add")
    if (!updateResult.success) {
      // If updating points fails, don't add the stay
      return updateResult
    }

    // Only save the stay if point allocation was successful
    await redis.set(KEYS.STAYS, updatedStays)

    // Log the stay addition for audit purposes
    await logStayAction({
      transactionId,
      action: "create",
      stay: newStay,
      timestamp: Date.now(),
    })

    return {
      success: true,
      message: "Stay added successfully",
      stay: newStay,
    }
  } catch (error) {
    console.error("Error adding stay:", error)
    return {
      success: false,
      message: "An unexpected error occurred",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Add this function to validate stays before adding
async function validateStay(stay: Omit<Stay, "id" | "createdAt" | "transactionId">): Promise<StayResult> {
  // Check that the stay has valid dates
  if (!stay.checkIn || !stay.checkOut) {
    return {
      success: false,
      message: "Stay must have valid check-in and check-out dates",
    }
  }

  // Check that points are positive
  if (stay.points <= 0) {
    return {
      success: false,
      message: "Points must be greater than zero",
    }
  }

  // Check that the allocation adds up to the total points
  const totalAllocated = stay.allocation.reduce((sum, alloc) => sum + alloc.points, 0)
  if (totalAllocated !== stay.points) {
    return {
      success: false,
      message: `Point allocation (${totalAllocated}) does not match total points (${stay.points})`,
    }
  }

  // Check that each member has enough available points
  const memberPoints = await getMemberPoints()

  for (const alloc of stay.allocation) {
    const member = memberPoints.find((m) => m.name === alloc.member)
    if (!member) {
      return {
        success: false,
        message: `Member ${alloc.member} not found`,
      }
    }

    if (member.available < alloc.points) {
      return {
        success: false,
        message: `${alloc.member} does not have enough available points (${member.available} available, ${alloc.points} needed)`,
      }
    }
  }

  return {
    success: true,
    message: "Stay validation successful",
  }
}

export async function updateStay(stayId: string, updatedStay: Partial<Stay>): Promise<Stay | null> {
  try {
    const stays = await getStays()
    const stayIndex = stays.findIndex((stay) => stay.id === stayId)

    if (stayIndex === -1) {
      return null
    }

    const oldStay = stays[stayIndex]
    const newStay = { ...oldStay, ...updatedStay }

    stays[stayIndex] = newStay
    await redis.set(KEYS.STAYS, stays)

    // Update point allocations if points changed
    if (
      oldStay.points !== newStay.points ||
      JSON.stringify(oldStay.allocation) !== JSON.stringify(newStay.allocation)
    ) {
      await updatePointsAfterStayChange(oldStay, "remove")
      await updatePointsAfterStayChange(newStay, "add")
    }

    return newStay
  } catch (error) {
    console.error("Error updating stay:", error)
    return null
  }
}

export async function deleteStay(stayId: string): Promise<boolean> {
  try {
    const stays = await getStays()
    const stayIndex = stays.findIndex((stay) => stay.id === stayId)

    if (stayIndex === -1) {
      return false
    }

    const stayToRemove = stays[stayIndex]

    // Remove the stay
    stays.splice(stayIndex, 1)
    await redis.set(KEYS.STAYS, stays)

    // Update point allocations
    await updatePointsAfterStayChange(stayToRemove, "remove")

    return true
  } catch (error) {
    console.error("Error deleting stay:", error)
    return false
  }
}

// Transfers functions
export async function getTransfers(): Promise<PointTransfer[]> {
  try {
    // First check if the key exists
    const exists = await redis.exists(KEYS.TRANSFERS)

    if (!exists) {
      // Default data if nothing exists yet
      const defaultData = [
        {
          id: "transfer1",
          fromMember: "Brian",
          toMember: "Rachel",
          points: 25,
          useYear: "2024",
          transferDate: "March 15, 2024",
          returnDate: "September 1, 2025",
          status: "Active",
          notes: "For Rachel's birthday trip",
          createdAt: Date.now(),
          transactionId: generateTransactionId(),
        },
        {
          id: "transfer2",
          fromMember: "Parents",
          toMember: "Brian",
          points: 15,
          useYear: "2023",
          transferDate: "November 10, 2023",
          returnDate: "September 1, 2024",
          status: "Active",
          notes: "Extra points for Christmas trip",
          createdAt: Date.now(),
          transactionId: generateTransactionId(),
        },
        {
          id: "transfer3",
          fromMember: "Rachel",
          toMember: "Parents",
          points: 10,
          useYear: "2023",
          transferDate: "August 5, 2023",
          returnDate: "September 1, 2024",
          status: "Returned",
          notes: "Anniversary trip",
          createdAt: Date.now(),
          transactionId: generateTransactionId(),
        },
      ]

      // Initialize the data in Redis
      await redis.set(KEYS.TRANSFERS, defaultData)
      return defaultData
    }

    // If the key exists, get the data
    const data = await redis.get(KEYS.TRANSFERS)

    // Check if data is valid
    if (!data) {
      throw new Error("Redis returned empty data for existing key")
    }

    return data as PointTransfer[]
  } catch (error) {
    console.error("Error getting transfers:", error)
    // Return default data in case of error
    return [
      {
        id: "transfer1",
        fromMember: "Brian",
        toMember: "Rachel",
        points: 25,
        useYear: "2024",
        transferDate: "March 15, 2024",
        returnDate: "September 1, 2025",
        status: "Active",
        notes: "For Rachel's birthday trip",
        createdAt: Date.now(),
        transactionId: generateTransactionId(),
      },
      {
        id: "transfer2",
        fromMember: "Parents",
        toMember: "Brian",
        points: 15,
        useYear: "2023",
        transferDate: "November 10, 2023",
        returnDate: "September 1, 2024",
        status: "Active",
        notes: "Extra points for Christmas trip",
        createdAt: Date.now(),
        transactionId: generateTransactionId(),
      },
      {
        id: "transfer3",
        fromMember: "Rachel",
        toMember: "Parents",
        points: 10,
        useYear: "2023",
        transferDate: "August 5, 2023",
        returnDate: "September 1, 2024",
        status: "Returned",
        notes: "Anniversary trip",
        createdAt: Date.now(),
        transactionId: generateTransactionId(),
      },
    ]
  }
}

export async function addTransfer(
  transfer: Omit<PointTransfer, "id" | "createdAt" | "transactionId">,
): Promise<TransferResult> {
  try {
    // Validate the transfer
    const validationResult = await validateTransfer(transfer)
    if (!validationResult.success) {
      return validationResult
    }

    const transfers = await getTransfers()

    // Generate a unique transaction ID for security tracking
    const transactionId = generateTransactionId()

    const newTransfer: PointTransfer = {
      ...transfer,
      id: `transfer${Date.now()}`,
      createdAt: Date.now(),
      transactionId,
    }

    const updatedTransfers = [...transfers, newTransfer]
    await redis.set(KEYS.TRANSFERS, updatedTransfers)

    // Update member points
    const updateResult = await updatePointsAfterTransfer(newTransfer)
    if (!updateResult.success) {
      // If updating points fails, remove the transfer
      const filteredTransfers = updatedTransfers.filter((t) => t.id !== newTransfer.id)
      await redis.set(KEYS.TRANSFERS, filteredTransfers)
      return updateResult
    }

    // Log the transfer for audit purposes
    await logTransfer({
      transactionId,
      action: "create",
      transfer: newTransfer,
      timestamp: Date.now(),
    })

    return {
      success: true,
      message: "Transfer completed successfully",
      transfer: newTransfer,
    }
  } catch (error) {
    console.error("Error adding transfer:", error)
    return {
      success: false,
      message: "An unexpected error occurred",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function updateTransferStatus(transferId: string, status: "Active" | "Returned"): Promise<TransferResult> {
  try {
    const transfers = await getTransfers()
    const transferIndex = transfers.findIndex((transfer) => transfer.id === transferId)

    if (transferIndex === -1) {
      return {
        success: false,
        message: "Transfer not found",
      }
    }

    const oldTransfer = transfers[transferIndex]

    // If already in the requested state, no change needed
    if (oldTransfer.status === status) {
      return {
        success: true,
        message: `Transfer already marked as ${status}`,
        transfer: oldTransfer,
      }
    }

    const newTransfer = { ...oldTransfer, status }

    transfers[transferIndex] = newTransfer
    await redis.set(KEYS.TRANSFERS, transfers)

    // Update member points if status changed from Active to Returned
    if (oldTransfer.status === "Active" && status === "Returned") {
      const updateResult = await reverseTransfer(newTransfer)
      if (!updateResult.success) {
        // If reversing fails, revert the status change
        transfers[transferIndex] = oldTransfer
        await redis.set(KEYS.TRANSFERS, transfers)
        return updateResult
      }
    }

    // Log the status change for audit purposes
    await logTransfer({
      transactionId: oldTransfer.transactionId,
      action: "update",
      transfer: newTransfer,
      timestamp: Date.now(),
      previousStatus: oldTransfer.status,
    })

    return {
      success: true,
      message: `Transfer marked as ${status} successfully`,
      transfer: newTransfer,
    }
  } catch (error) {
    console.error("Error updating transfer status:", error)
    return {
      success: false,
      message: "An unexpected error occurred",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Helper functions
// Update the updatePointsAfterStayChange function to return a result
async function updatePointsAfterStayChange(stay: Stay, action: "add" | "remove"): Promise<StayResult> {
  try {
    const pointSummary = await getPointSummary()
    const memberPoints = await getMemberPoints()

    const multiplier = action === "add" ? 1 : -1

    // Update total points used
    pointSummary.usedPoints += stay.points * multiplier
    pointSummary.availablePoints -= stay.points * multiplier

    // Update point breakdown
    // Determine which year's points to use based on the stay dates
    const stayYear = new Date(stay.checkIn).getFullYear()
    let yearUpdated = false

    for (const yearData of pointSummary.pointBreakdown) {
      if (yearData.year === stayYear) {
        yearData.used += stay.points * multiplier
        yearData.available -= stay.points * multiplier
        yearUpdated = true
        break
      }
    }

    // If no matching year was found, use the current year
    if (!yearUpdated) {
      const currentYearIndex = pointSummary.pointBreakdown.findIndex((year) => year.year === new Date().getFullYear())
      if (currentYearIndex !== -1) {
        pointSummary.pointBreakdown[currentYearIndex].used += stay.points * multiplier
        pointSummary.pointBreakdown[currentYearIndex].available -= stay.points * multiplier
      }
    }

    // Update member points
    for (const allocation of stay.allocation) {
      const memberIndex = memberPoints.findIndex((member) => member.name === allocation.member)
      if (memberIndex !== -1) {
        memberPoints[memberIndex].used += allocation.points * multiplier
        memberPoints[memberIndex].available -= allocation.points * multiplier
      }
    }

    // Save the updated point data
    await updatePointSummary(pointSummary)
    await updateMemberPoints(memberPoints)

    return {
      success: true,
      message: `Points updated successfully for ${action === "add" ? "new" : "removed"} stay`,
    }
  } catch (error) {
    console.error(`Error updating points after stay ${action}:`, error)
    return {
      success: false,
      message: `Failed to update points for ${action === "add" ? "new" : "removed"} stay`,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function validateTransfer(
  transfer: Omit<PointTransfer, "id" | "createdAt" | "transactionId">,
): Promise<TransferResult> {
  // Check that sender and recipient are different
  if (transfer.fromMember === transfer.toMember) {
    return {
      success: false,
      message: "Cannot transfer points to the same member",
    }
  }

  // Check that points are positive
  if (transfer.points <= 0) {
    return {
      success: false,
      message: "Points must be greater than zero",
    }
  }

  // Check that sender has enough available points
  const memberPoints = await getMemberPoints()
  const fromMember = memberPoints.find((member) => member.name === transfer.fromMember)

  if (!fromMember) {
    return {
      success: false,
      message: "Sender not found",
    }
  }

  if (fromMember.available < transfer.points) {
    return {
      success: false,
      message: `${transfer.fromMember} does not have enough available points (${fromMember.available} available)`,
    }
  }

  return {
    success: true,
    message: "Transfer validation successful",
  }
}

async function updatePointsAfterTransfer(transfer: PointTransfer): Promise<TransferResult> {
  try {
    if (transfer.status === "Returned") {
      return { success: true, message: "No need to update points for returned transfers" }
    }

    const memberPoints = await getMemberPoints()

    // Find the members
    const fromMemberIndex = memberPoints.findIndex((member) => member.name === transfer.fromMember)
    const toMemberIndex = memberPoints.findIndex((member) => member.name === transfer.toMember)

    if (fromMemberIndex === -1 || toMemberIndex === -1) {
      return {
        success: false,
        message: "One or both members not found",
      }
    }

    // Double-check that sender has enough points
    if (memberPoints[fromMemberIndex].available < transfer.points) {
      return {
        success: false,
        message: `${transfer.fromMember} does not have enough available points`,
      }
    }

    // Update lender (fromMember)
    memberPoints[fromMemberIndex].lent += transfer.points
    memberPoints[fromMemberIndex].available -= transfer.points

    // Update borrower (toMember)
    memberPoints[toMemberIndex].borrowed += transfer.points
    memberPoints[toMemberIndex].available += transfer.points

    await updateMemberPoints(memberPoints)

    return {
      success: true,
      message: "Points updated successfully",
    }
  } catch (error) {
    console.error("Error updating points after transfer:", error)
    return {
      success: false,
      message: "Failed to update points",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function reverseTransfer(transfer: PointTransfer): Promise<TransferResult> {
  try {
    const memberPoints = await getMemberPoints()

    // Find the members
    const fromMemberIndex = memberPoints.findIndex((member) => member.name === transfer.fromMember)
    const toMemberIndex = memberPoints.findIndex((member) => member.name === transfer.toMember)

    if (fromMemberIndex === -1 || toMemberIndex === -1) {
      return {
        success: false,
        message: "One or both members not found",
      }
    }

    // Check if borrower has enough available points to return
    if (memberPoints[toMemberIndex].available < transfer.points) {
      return {
        success: false,
        message: `${transfer.toMember} does not have enough available points to return`,
      }
    }

    // Update lender (fromMember) - return their points
    memberPoints[fromMemberIndex].lent -= transfer.points
    memberPoints[fromMemberIndex].available += transfer.points

    // Update borrower (toMember) - remove their borrowed points
    memberPoints[toMemberIndex].borrowed -= transfer.points
    memberPoints[toMemberIndex].available -= transfer.points

    await updateMemberPoints(memberPoints)

    return {
      success: true,
      message: "Points returned successfully",
    }
  } catch (error) {
    console.error("Error reversing transfer:", error)
    return {
      success: false,
      message: "Failed to reverse transfer",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// Security and audit functions
function generateTransactionId(): string {
  // Generate a unique transaction ID for security tracking
  return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

async function logTransfer(logEntry: {
  transactionId: string
  action: "create" | "update" | "delete"
  transfer: PointTransfer
  timestamp: number
  previousStatus?: string
}): Promise<void> {
  try {
    const logs = (await redis.get(KEYS.TRANSFER_LOGS)) || []
    logs.push(logEntry)
    await redis.set(KEYS.TRANSFER_LOGS, logs)
  } catch (error) {
    console.error("Error logging transfer:", error)
    // Don't throw - logging should not block the main operation
  }
}

// Add this function to log stay actions for audit purposes
async function logStayAction(logEntry: {
  transactionId: string
  action: "create" | "update" | "delete"
  stay: Stay
  timestamp: number
  previousState?: Stay
}): Promise<void> {
  try {
    const logs = (await redis.get(KEYS.STAY_LOGS)) || []
    logs.push(logEntry)
    await redis.set(KEYS.STAY_LOGS, logs)
  } catch (error) {
    console.error("Error logging stay action:", error)
    // Don't throw - logging should not block the main operation
  }
}

// Function to get transfer logs (for admin purposes)
export async function getTransferLogs(): Promise<any[]> {
  try {
    return (await redis.get(KEYS.TRANSFER_LOGS)) || []
  } catch (error) {
    console.error("Error getting transfer logs:", error)
    return []
  }
}

