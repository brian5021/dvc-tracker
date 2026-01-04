"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { RefreshCw, Info } from "lucide-react"
import { usePoints } from "@/context/point-context"
import { getCurrentContractYear, formatContractYearRange } from "@/lib/utils/date-utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function PointSummary() {
  const { pointSummary, memberPoints, loading, error, refreshData } = usePoints()

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Point Summary</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-40 flex items-center justify-center">
              <div className="animate-pulse bg-gray-200 h-4 w-3/4 rounded"></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Family Allocation</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-40 flex items-center justify-center">
              <div className="animate-pulse bg-gray-200 h-4 w-3/4 rounded"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !pointSummary || !memberPoints) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Point Summary</CardTitle>
            <CardDescription>Error loading data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-red-500">{error || "Failed to load point data. Please try refreshing the page."}</div>
            <Button onClick={refreshData} variant="outline" size="sm" className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Get dynamic values from pointSummary instead of hardcoding
  const currentYearData = pointSummary.pointBreakdown.find((p) => p.status === "Current")
  const bankedYearData = pointSummary.pointBreakdown.find((p) => p.status === "Banked")

  // Use dynamic values or fallback to 0
  const currentYearPoints = currentYearData?.total || 0
  const bankedYearPoints = bankedYearData?.total || 0
  const remainingBankedPoints = bankedYearData?.available || 0

  // Calculate total points (all points from both years)
  const totalPoints = pointSummary.totalPoints
  const usedPoints = pointSummary.usedPoints
  const availablePoints = pointSummary.availablePoints

  // Calculate percentage used
  const percentUsed = totalPoints > 0 ? Math.round((usedPoints / totalPoints) * 100) : 0

  // Get the current contract year
  const contractYear = getCurrentContractYear()

  // Format the contract year range
  const contractYearRange = formatContractYearRange(contractYear - 1)

  // Calculate banking deadline
  const bankingDeadline = new Date(`${contractYear}-04-30`)
  const today = new Date()
  const bankingDeadlinePassed = today > bankingDeadline

  // Calculate expiration deadline
  const expirationDeadline = new Date(`${contractYear}-08-31`)
  const expirationDeadlinePassed = today > expirationDeadline

  // Calculate total points being banked this year (unavailable until next year)
  const totalPointsBeingBanked = memberPoints.reduce((sum, m) => sum + (m.pointsBeingBanked || 0), 0)

  // Add safety checks for calculations that might result in NaN
  const safeCurrentYearPoints = currentYearPoints || 0
  const safeBankedYearPoints = bankedYearPoints || 0
  const safeRemainingBankedPoints = remainingBankedPoints || 0
  const safeTotalPointsBeingBanked = totalPointsBeingBanked || 0

  // Ensure all calculations that might result in NaN have fallbacks
  const safePercentUsed = totalPoints > 0 ? Math.round((usedPoints / totalPoints) * 100) : 0

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Point Summary</CardTitle>
          <CardDescription>
            {currentYearData?.contractYear || `Sept ${contractYear - 1} - Aug ${contractYear}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total Points</span>
              <span className="text-2xl font-bold">{totalPoints}</span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Used: {usedPoints}</span>
                <span>Available: {availablePoints}</span>
              </div>
              <Progress value={safePercentUsed} className="h-2" />
            </div>

            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Point Breakdown</h4>
              <div className="space-y-2">
                <div className="grid grid-cols-3 text-sm">
                  <div>Current Year Points:</div>
                  <div className="text-right">{safeCurrentYearPoints}</div>
                  <div></div>
                </div>
                <div className="grid grid-cols-3 text-sm">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-start text-left">
                        <span>Banked from Previous Year:</span>
                        <Info className="h-3 w-3 ml-1 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Points banked from previous year. Available now but will expire at the end of the current
                          contract year.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="text-right text-blue-600">{safeRemainingBankedPoints}</div>
                  <div className="text-xs text-muted-foreground pl-2">Available now</div>
                </div>
                {safeTotalPointsBeingBanked > 0 && (
                  <div className="grid grid-cols-3 text-sm">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger className="flex items-start text-left">
                          <span>Banked This Year:</span>
                          <Info className="h-3 w-3 ml-1 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            Points banked in the current year. Unavailable until the next contract year.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="text-right text-amber-600">{safeTotalPointsBeingBanked}</div>
                    <div className="text-xs text-amber-600 pl-2">Available Sept 1st</div>
                  </div>
                )}
                <div className="grid grid-cols-3 text-sm font-medium pt-2 border-t">
                  <div>Total Points:</div>
                  <div className="text-right">{totalPoints}</div>
                  <div></div>
                </div>
                <div className="grid grid-cols-3 text-sm pt-2 border-t">
                  <div>Used in Bookings:</div>
                  <div className="text-right">{usedPoints}</div>
                  <div></div>
                </div>
                <div className="grid grid-cols-3 text-sm font-medium">
                  <div>Available Points:</div>
                  <div className="text-right">{availablePoints}</div>
                  <div></div>
                </div>
                {safeTotalPointsBeingBanked > 0 && (
                  <div className="grid grid-cols-3 text-sm text-amber-600 pt-2 border-t">
                    <div>Available Next Year:</div>
                    <div className="text-right">{safeTotalPointsBeingBanked}</div>
                    <div className="text-xs pl-2">From banking</div>
                  </div>
                )}
              </div>
            </div>

            {/* Add deadlines information */}
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Important Deadlines</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Banking Deadline:</span>
                  <span className={bankingDeadlinePassed ? "text-red-500" : "text-green-500"}>
                    April 30, {contractYear}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Point Expiration:</span>
                  <span className={expirationDeadlinePassed ? "text-red-500" : "text-green-500"}>
                    August 31, {contractYear}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Family Allocation</CardTitle>
          <CardDescription>Available points per family member</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {memberPoints.map((member) => {
              if (!member) return null
              const netBorrowedLent = (member.borrowed || 0) - (member.lent || 0)
              return (
                <div key={member.name} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-medium" style={{ color: member.color }}>
                      {member.name}
                    </span>
                    <span className="text-sm">
                      {member.available || 0} / {member.total || 0} available
                    </span>
                  </div>
                  <Progress
                    value={member.total > 0 ? ((member.available || 0) / member.total) * 100 : 0}
                    className="h-2"
                  />

                  <div className="grid grid-cols-2 gap-x-4 text-xs pt-1">
                    <div className="flex justify-between">
                      <span>Current:</span>
                      <span>{member.currentYearPoints || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Banked (Available):</span>
                      <span className="text-blue-600">{member.bankedPoints || 0}</span>
                    </div>
                    {member.pointsBeingBanked > 0 && (
                      <div className="flex justify-between">
                        <span>Banked This Year:</span>
                        <span className="text-amber-600">{member.pointsBeingBanked}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Used:</span>
                      <span className="text-red-600">{member.used || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Net Borrowed/Lent:</span>
                      <span
                        style={{
                          color:
                            netBorrowedLent > 0
                              ? "rgb(22, 163, 74)"
                              : netBorrowedLent < 0
                                ? "rgb(217, 119, 6)"
                                : "inherit",
                        }}
                      >
                        {netBorrowedLent > 0 ? "+" : ""}
                        {netBorrowedLent}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
