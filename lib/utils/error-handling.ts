/**
 * Safely executes a Redis operation with error handling
 * @param operation The async operation to execute
 * @param defaultValue The default value to return if the operation fails
 * @param errorMessage The error message to log if the operation fails
 * @returns The result of the operation or the default value
 */
export async function safeRedisOperation<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  errorMessage: string,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    console.error(`${errorMessage}:`, error)
    return defaultValue
  }
}

/**
 * Creates a standardized error result
 * @param message The error message
 * @param error The original error object (optional)
 * @returns A standardized error result object
 */
export function createErrorResult<T extends { success: boolean; message: string; error?: string }>(
  message: string,
  error?: unknown,
): T {
  return {
    success: false,
    message,
    error: error instanceof Error ? error.message : String(error),
  } as T
}
