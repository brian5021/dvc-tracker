"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { usePoints } from "@/context/point-context"
import type { Member, PointTransfer } from "@/lib/types"

interface PointAllocationHistoryProps {
  memberName: Member
  limit?: number
  showAll?: boolean
}

export function PointAllocationHistory({ memberName, limit = 5, showAll = false }: PointAllocationHistoryProps) {
  const { transfers } = usePoints()
  const [expanded, setExpanded] = useState(false)

  if (!transfers) return <div>Loading...</div>

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
    return <div className="text-sm text-muted-foreground">No transfer history</div>
  }

  return (
    <div className="space-y-3">
      {displayedTransfers.map((transfer) => (
        <TransferHistoryItem key={transfer.id} transfer={transfer} memberName={memberName} />
      ))}

      {!showAll && sortedTransfers.length > limit && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm text-blue-600 hover:underline w-full text-center mt-2"
        >
          Show {sortedTransfers.length - limit} more transactions
        </button>
      )}

      {!showAll && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="text-sm text-blue-600 hover:underline w-full text-center mt-2"
        >
          Show less
        </button>
      )}
    </div>
  )
}

function TransferHistoryItem({ transfer, memberName }: { transfer: PointTransfer; memberName: Member }) {
  const isLender = transfer.fromMember === memberName
  const otherMember = isLender ? transfer.toMember : transfer.fromMember

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium text-sm">
              {isLender ? `Lent to ${otherMember}` : `Borrowed from ${otherMember}`}
            </div>
            <div className="text-xs text-muted-foreground">{transfer.transferDate}</div>
            <div className="text-xs mt-1">
              {isLender ? "Lent" : "Borrowed"} <span className="font-medium">{transfer.points}</span> points
            </div>
          </div>
          <Badge variant={transfer.status === "Returned" ? "outline" : "default"}>{transfer.status}</Badge>
        </div>
      </CardContent>
    </Card>
  )
}

