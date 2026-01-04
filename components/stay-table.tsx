"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CalendarDays, Check, Clock, Info, RefreshCw } from "lucide-react"
import type { Stay } from "@/lib/types"
import { deleteStay } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { usePoints } from "@/context/point-context"

export function StayTable() {
  const { stays, loading, error, refreshStays } = usePoints()
  const [stayToDelete, setStayToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedStay, setSelectedStay] = useState<Stay | null>(null)
  const router = useRouter()

  const handleDeleteStay = async () => {
    if (!stayToDelete) return

    try {
      setDeleting(true)
      const success = await deleteStay(stayToDelete)

      if (success) {
        toast({
          title: "Stay Deleted",
          description: "The stay has been successfully deleted and points have been returned.",
        })

        // Refresh the stays list
        await refreshStays()
      } else {
        toast({
          title: "Error",
          description: "Failed to delete the stay. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting stay:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
      setStayToDelete(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Confirmed":
        return (
          <Badge className="bg-green-500">
            <Check className="w-3 h-3 mr-1" /> {status}
          </Badge>
        )
      case "Waitlisted":
        return (
          <Badge className="bg-amber-500">
            <Clock className="w-3 h-3 mr-1" /> {status}
          </Badge>
        )
      case "Completed":
        return (
          <Badge variant="outline">
            <Check className="w-3 h-3 mr-1" /> {status}
          </Badge>
        )
      case "Cancelled":
        return <Badge variant="destructive">{status}</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getRoomTypeLabel = (roomType: string) => {
    switch (roomType) {
      case "studio":
        return "Deluxe Studio"
      case "one_bedroom":
        return "One-Bedroom Villa"
      case "two_bedroom":
        return "Two-Bedroom Villa"
      case "three_bedroom":
        return "Three-Bedroom Villa"
      case "cabin":
        return "Cabin"
      case "bungalow":
        return "Bungalow"
      default:
        return roomType
    }
  }

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <div className="animate-pulse bg-gray-200 h-4 w-3/4 rounded"></div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button onClick={refreshStays} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </Alert>
    )
  }

  if (!stays || stays.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No stays found. Add a new stay to get started.</div>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resort</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Nights</TableHead>
              <TableHead>Room Type</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Point Allocation</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stays.map((stay) => (
              <TableRow key={stay.id}>
                <TableCell className="font-medium">{stay.resort}</TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <CalendarDays className="w-4 h-4 mr-1 text-muted-foreground" />
                    {stay.dates}
                  </div>
                </TableCell>
                <TableCell>{stay.nights}</TableCell>
                <TableCell>{getRoomTypeLabel(stay.roomType)}</TableCell>
                <TableCell className="font-medium">{stay.points}</TableCell>
                <TableCell>{getStatusBadge(stay.status)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {stay.allocation.map((alloc) => (
                      <Badge key={alloc.member} variant="outline" className="text-xs">
                        {alloc.member}: {alloc.points}
                        {alloc.borrowedFrom && alloc.borrowedFrom.length > 0 && (
                          <span className="ml-1 text-amber-600">*</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedStay(stay)} title="View Details">
                      <Info className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => setStayToDelete(stay.id)}
                      title="Delete Stay"
                    >
                      <AlertCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!stayToDelete} onOpenChange={(open) => !open && setStayToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this stay? This will return all allocated points to their respective
              members.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStayToDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteStay} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Stay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stay Details Dialog */}
      <Dialog open={!!selectedStay} onOpenChange={(open) => !open && setSelectedStay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stay Details</DialogTitle>
          </DialogHeader>
          {selectedStay && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">Resort</h3>
                <p>{selectedStay.resort}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium">Check-in</h3>
                  <p>{selectedStay.checkIn}</p>
                </div>
                <div>
                  <h3 className="font-medium">Check-out</h3>
                  <p>{selectedStay.checkOut}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium">Room Type</h3>
                  <p>{getRoomTypeLabel(selectedStay.roomType)}</p>
                </div>
                <div>
                  <h3 className="font-medium">Status</h3>
                  <div className="mt-1">{getStatusBadge(selectedStay.status)}</div>
                </div>
              </div>
              <div>
                <h3 className="font-medium">Point Allocation</h3>
                <div className="mt-2 space-y-2">
                  {selectedStay.allocation.map((alloc) => (
                    <div key={alloc.member} className="space-y-1">
                      <div className="flex justify-between">
                        <span>{alloc.member}</span>
                        <span className="font-medium">{alloc.points} points</span>
                      </div>
                      {alloc.borrowedFrom && alloc.borrowedFrom.length > 0 && alloc.borrowedPoints && (
                        <div className="text-xs text-amber-600 pl-4">
                          <p>Used banked points from:</p>
                          <ul className="list-disc pl-4">
                            {alloc.borrowedFrom.map((member, idx) => (
                              <li key={member}>
                                {member}: {alloc.borrowedPoints?.[idx] || 0} points
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="pt-2 border-t flex justify-between font-bold">
                    <span>Total</span>
                    <span>{selectedStay.points} points</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSelectedStay(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
