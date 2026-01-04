"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { fixNegativeBankedPoints, cleanupDuplicateTransfers } from "@/lib/actions"
import { RefreshCw, AlertTriangle } from "lucide-react"
import { usePoints } from "@/context/point-context"

export function DatabaseCleanup() {
  const [isFixingPoints, setIsFixingPoints] = useState(false)
  const [isCleaningTransfers, setIsCleaningTransfers] = useState(false)
  const { refreshData } = usePoints()

  const handleFixNegativeBankedPoints = async () => {
    try {
      setIsFixingPoints(true)
      const result = await fixNegativeBankedPoints()

      if (result) {
        toast({
          title: "Points Fixed",
          description: "Successfully fixed negative banked points.",
        })
      } else {
        toast({
          title: "No Issues Found",
          description: "No negative banked points were found.",
        })
      }

      // Refresh data
      await refreshData()
    } catch (error) {
      console.error("Error fixing points:", error)
      toast({
        title: "Error",
        description: "Failed to fix negative banked points.",
        variant: "destructive",
      })
    } finally {
      setIsFixingPoints(false)
    }
  }

  const handleCleanupDuplicateTransfers = async () => {
    try {
      setIsCleaningTransfers(true)
      const result = await cleanupDuplicateTransfers()

      if (result.success) {
        toast({
          title: "Transfers Cleaned",
          description: result.message,
        })
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }

      // Refresh data
      await refreshData()
    } catch (error) {
      console.error("Error cleaning transfers:", error)
      toast({
        title: "Error",
        description: "Failed to clean up duplicate transfers.",
        variant: "destructive",
      })
    } finally {
      setIsCleaningTransfers(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Database Maintenance</CardTitle>
        <CardDescription>Fix issues with points and transfers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start space-x-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Database Issues Detected</p>
            <p className="text-sm text-muted-foreground">
              The system has detected issues with negative banked points or duplicate transfers. Use the tools below to
              fix these issues.
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={handleFixNegativeBankedPoints} disabled={isFixingPoints}>
          {isFixingPoints ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Fixing Points...
            </>
          ) : (
            <>Fix Negative Banked Points</>
          )}
        </Button>
        <Button variant="outline" onClick={handleCleanupDuplicateTransfers} disabled={isCleaningTransfers}>
          {isCleaningTransfers ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Cleaning Transfers...
            </>
          ) : (
            <>Clean Up Duplicate Transfers</>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
