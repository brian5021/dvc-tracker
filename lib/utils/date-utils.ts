/**
 * Checks if the current date is past the banking deadline (April 30th)
 * @returns True if past the deadline, false otherwise
 */
export function isPastBankingDeadline(): boolean {
  const currentYear = new Date().getFullYear()
  const bankingDeadline = new Date(`${currentYear}-04-30`)
  const today = new Date()
  return today > bankingDeadline
}

/**
 * Checks if the current date is the contract rollover date (September 1st)
 * @returns True if it's the rollover date, false otherwise
 */
export function isContractRolloverDate(): boolean {
  const today = new Date()
  // Month is 0-indexed, so 8 = September
  return today.getMonth() === 8 && today.getDate() === 1
}

/**
 * Checks if the current date is the point expiration date (August 31st)
 * @returns True if it's the expiration date, false otherwise
 */
export function isPointExpirationDate(): boolean {
  const today = new Date()
  // Month is 0-indexed, so 7 = August
  return today.getMonth() === 7 && today.getDate() === 31
}

/**
 * Gets the current contract year
 * @returns The current contract year
 */
export function getCurrentContractYear(): number {
  const today = new Date()
  const currentMonth = today.getMonth() // 0-indexed, so 8 = September
  const currentYear = today.getFullYear()

  // If the date is between Sept 1 and Dec 31, the contract year is current year + 1
  // If the date is between Jan 1 and Aug 31, the contract year is current year
  if (currentMonth >= 8) {
    // September (8) through December (11)
    return currentYear + 1
  } else {
    return currentYear
  }
}

/**
 * Formats a contract year range string
 * @param year The starting year of the contract
 * @returns A formatted string like "Sept 2023 - Aug 2024"
 */
export function formatContractYearRange(year: number): string {
  return `Sept ${year} - Aug ${year + 1}`
}

/**
 * Calculates days until a target date
 * @param targetDate The target date string in ISO format
 * @returns Number of days until the target date
 */
export function daysUntil(targetDate: string): number {
  const target = new Date(targetDate)
  const today = new Date()
  const diffTime = target.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}
