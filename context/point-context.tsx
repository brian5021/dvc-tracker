"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import type { MemberPoints, PointAllocation, Stay, PointTransfer } from "@/lib/types"
import { getPointSummary, getMemberPoints, getStays, getTransfers } from "@/lib/actions"

type PointSummary = {
  totalPoints: number
  availablePoints: number
  usedPoints: number
  pointBreakdown: PointAllocation[]
}

type PointContextType = {
  pointSummary: PointSummary | null
  memberPoints: MemberPoints[] | null
  stays: Stay[] | null
  transfers: PointTransfer[] | null
  loading: boolean
  error: string | null
  refreshData: () => Promise<void>
  refreshStays: () => Promise<void>
  refreshTransfers: () => Promise<void>
}

const PointContext = createContext<PointContextType>({
  pointSummary: null,
  memberPoints: null,
  stays: null,
  transfers: null,
  loading: false,
  error: null,
  refreshData: async () => {},
  refreshStays: async () => {},
  refreshTransfers: async () => {},
})

export function usePoints() {
  return useContext(PointContext)
}

export function PointProvider({ children }: { children: React.ReactNode }) {
  const [pointSummary, setPointSummary] = useState<PointSummary | null>(null)
  const [memberPoints, setMemberPoints] = useState<MemberPoints[] | null>(null)
  const [stays, setStays] = useState<Stay[] | null>(null)
  const [transfers, setTransfers] = useState<PointTransfer[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Function to refresh all data
  async function refreshData() {
    try {
      setLoading(true)
      setError(null)
      const [summaryData, membersData, staysData, transfersData] = await Promise.all([
        getPointSummary(),
        getMemberPoints(),
        getStays(),
        getTransfers(),
      ])
      setPointSummary(summaryData)
      setMemberPoints(membersData)
      setStays(staysData)
      setTransfers(transfersData)
    } catch (error) {
      console.error("Error refreshing data:", error)
      setError("Failed to load data. Please try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  // Function to refresh only stays
  async function refreshStays() {
    try {
      const staysData = await getStays()
      setStays(staysData)
      // Also refresh point data since stays affect points
      const [summaryData, membersData] = await Promise.all([getPointSummary(), getMemberPoints()])
      setPointSummary(summaryData)
      setMemberPoints(membersData)
    } catch (error) {
      console.error("Error refreshing stays:", error)
    }
  }

  // Function to refresh only transfers
  async function refreshTransfers() {
    try {
      const transfersData = await getTransfers()
      setTransfers(transfersData)
      // Also refresh member points since transfers affect points
      const membersData = await getMemberPoints()
      setMemberPoints(membersData)
    } catch (error) {
      console.error("Error refreshing transfers:", error)
    }
  }

  // Load data on initial render
  useEffect(() => {
    refreshData()
  }, [])

  return (
    <PointContext.Provider
      value={{
        pointSummary,
        memberPoints,
        stays,
        transfers,
        loading,
        error,
        refreshData,
        refreshStays,
        refreshTransfers,
      }}
    >
      {children}
    </PointContext.Provider>
  )
}

