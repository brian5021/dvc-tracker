import { Redis } from "@upstash/redis"

// This file should only be imported from server components or server actions
// Initialize Redis client using the appropriate environment variables
// Disable pipelining to avoid 405 Method Not Allowed errors
export const redis = new Redis({
  url: process.env.KV_REST_API_URL || "",
  token: process.env.KV_REST_API_TOKEN || "",
  automaticDeserialization: true,
  enableAutoPipelining: false, // Disable auto pipelining to avoid 405 errors
})
