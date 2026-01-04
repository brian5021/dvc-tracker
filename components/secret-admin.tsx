"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "@/components/ui/use-toast"
import { DatabaseInitializer } from "./database-initializer"

export function SecretAdmin() {
  const [clickCount, setClickCount] = useState(0)
  const [showAdmin, setShowAdmin] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Reset click count after 2 seconds of inactivity
  const resetClickCount = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      setClickCount(0)
    }, 2000)
  }

  const handleClick = () => {
    setClickCount((prev) => prev + 1)
    resetClickCount()
  }

  // Check if we've reached the required number of clicks (5)
  useEffect(() => {
    if (clickCount >= 5 && !showAdmin) {
      setShowAdmin(true)
      toast({
        title: "Admin Mode Activated",
        description: "Database initializer is now available.",
      })
    }
  }, [clickCount, showAdmin])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <div className="relative">
      <span onClick={handleClick} className="cursor-default select-none">
        Disney Vacation Club Point Tracker • Contract Start: September 1
      </span>

      {showAdmin && (
        <div className="absolute top-[-50px] left-1/2 transform -translate-x-1/2">
          <DatabaseInitializer visible={true} />
        </div>
      )}
    </div>
  )
}
