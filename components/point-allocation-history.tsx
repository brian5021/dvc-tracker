"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { usePoints } from "@/context/point-context"
import type { PointTransfer } from "@/lib/types"

interface PointAllocationHistoryProps {
  memberName: string
  limit?: number
  showAll?: boolean
}

export function PointAllocationHistory({ memberName, limit = 5, showAll = false }: PointAllocationHistoryProps) {
  const { transfers } = usePoints()
  const [expanded, setExpanded] = useState(false)

  if (!transfers) return null

  // Get all transfers for this member (both as sender and recipient)
  const memberTransfers = transfers.filter(
    (transfer) => transfer.fromMember === memberName || transfer.toMember === memberName,
  )

  // Sort by most recent first
  const sortedTransfers = [...memberTransfers].sort((a, b) => {
    // First by date (newest first)
    const dateA = new Date(a.transferDate).getTime()
    const dateB = new Date(b.transferDate).getTime()
    if (dateA !== dateB) return dateB - dateA

    // Then by creation time if dates are the same
    return b.createdAt - a.createdAt
  })

  // Limit the number of transfers shown unless expanded or showAll is true
  const displayedTransfers = expanded || showAll ? sortedTransfers : sortedTransfers.slice(0, limit)

  if (displayedTransfers.length === 0) {
    return null
  }

  return (
    <div className="space-y-2 mt-3 pt-3 border-t">
      <h5 className="text-xs font-medium uppercase text-muted-foreground">Transfer History</h5>
      {displayedTransfers.map((transfer) => (
        <TransferHistoryItem key={transfer.id} transfer={transfer} memberName={memberName} />
      ))}

      {!showAll && sortedTransfers.length > limit && !expanded && (
        <button onClick={() => setExpanded(true)} className="text-sm text-blue-600 hover:underline w-full text-left">
          Show {sortedTransfers.length - limit} more
        </button>
      )}

      {!showAll && expanded && (
        <button onClick={() => setExpanded(false)} className="text-sm text-blue-600 hover:underline w-full text-left">
          Show less
        </button>
      )}
    </div>
  )
}

function TransferHistoryItem({ transfer, memberName }: { transfer: PointTransfer; memberName: string }) {
  const isLender = transfer.fromMember === memberName
  const otherMember = isLender ? transfer.toMember : transfer.fromMember

  return (
    <div className="text-sm border-b pb-2 last:border-0 last:pb-0">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">{isLender ? `Lent to ${otherMember}` : `Borrowed from ${otherMember}`}</div>
          <div className="text-xs text-muted-foreground">{transfer.transferDate}</div>
          <div className="text-xs mt-1">
            {isLender ? "Lent" : "Borrowed"} <span className="font-medium">{transfer.points}</span> points
          </div>
        </div>
        <Badge variant={transfer.status === "Returned" ? "outline" : "default"}>{transfer.status}</Badge>
      </div>
    </div>
  )
}
