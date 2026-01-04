"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { RefreshCw, AlertCircle, ChevronDown, ChevronUp, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { usePoints } from "@/context/point-context"
import { PointAllocationHistory } from "./point-allocation-history"

export function PointAllocation() {
  const { memberPoints, transfers, stays, loading, error, refreshData } = usePoints()
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <div className="animate-pulse bg-gray-200 h-4 w-3/4 rounded"></div>
      </div>
    )
  }

  if (error || !memberPoints || !transfers || !stays) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error || "Failed to load data. Please try refreshing the page."}</AlertDescription>
        <Button onClick={refreshData} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </Alert>
    )
  }

  // Get member-specific transfers
  const getMemberTransfers = (memberName: string) => {
    // Return all transfers where the member is either the sender or recipient
    return transfers.filter((t) => t.fromMember === memberName || t.toMember === memberName)
  }

  // Get member-specific stays
  const getMemberStays = (memberName: string) => {
    return stays.filter((s) => s.allocation.some((a) => a.member === memberName))
  }

  const toggleMember = (memberName: string) => {
    setExpandedMember(expandedMember === memberName ? null : memberName)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Family Point Allocation</CardTitle>
        <CardDescription>Detailed breakdown of points for each family member</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Current Year</TableHead>
                <TableHead className="text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-end w-full">
                        Banked from Previous Year <Info className="h-3 w-3 ml-1 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Points banked from previous year. Available now but will expire at the end of the current
                          contract year.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center justify-end w-full">
                        Banked This Year <Info className="h-3 w-3 ml-1 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Points banked in the current year. Unavailable until the next contract year.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="text-right">Borrowed</TableHead>
                <TableHead className="text-right">Lent</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberPoints.map((member) => {
                const isExpanded = expandedMember === member.name

                return (
                  <>
                    <TableRow
                      key={member.name}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleMember(member.name)}
                    >
                      <TableCell className="font-medium" style={{ color: member.color }}>
                        {member.name}
                      </TableCell>
                      <TableCell className="text-right">{member.currentYearPoints || 0}</TableCell>
                      <TableCell className="text-right text-blue-600">{member.bankedPoints || 0}</TableCell>
                      <TableCell className="text-right text-amber-600">{member.pointsBeingBanked || 0}</TableCell>
                      <TableCell className="text-right text-green-600">{member.borrowed}</TableCell>
                      <TableCell className="text-right text-amber-600">{member.lent}</TableCell>
                      <TableCell className="text-right text-red-600">{member.used}</TableCell>
                      <TableCell className="text-right font-bold">{member.available}</TableCell>
                      <TableCell>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={9} className="p-0 border-t-0">
                          <div className="bg-gray-50 p-4 rounded-b-md">
                            <div className="grid gap-4 md:grid-cols-2">
                              {/* Point Calculation */}
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm">Point Calculation</h4>
                                <div className="bg-white p-3 rounded-md shadow-sm space-y-2">
                                  <div className="flex justify-between text-sm">
                                    <span>Current Year Points:</span>
                                    <span>{member.currentYearPoints || 0}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>Banked from Previous Year:</span>
                                    <span className="text-blue-600">+{member.bankedPoints || 0}</span>
                                  </div>
                                  {member.pointsBeingBanked > 0 && (
                                    <div className="flex justify-between text-sm">
                                      <span>Banked This Year (Available Sept 1):</span>
                                      <span className="text-amber-600">-{member.pointsBeingBanked}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-sm">
                                    <span>Borrowed Points:</span>
                                    <span className="text-green-600">+{member.borrowed}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>Points Used:</span>
                                    <span className="text-red-600">-{member.used}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>Points Lent:</span>
                                    <span className="text-amber-600">-{member.lent}</span>
                                  </div>
                                  <div className="flex justify-between text-sm font-medium pt-2 border-t">
                                    <span>Available Points:</span>
                                    <span>{member.available}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    (Current + Banked from Previous Year + Borrowed - Used - Lent - Banked This Year)
                                  </div>
                                </div>

                                {/* Banking and Expiration Dates */}
                                <div className="bg-white p-3 rounded-md shadow-sm space-y-2 mt-3">
                                  <h5 className="text-xs font-medium uppercase text-muted-foreground">
                                    Important Dates
                                  </h5>
                                  <div className="flex justify-between text-sm">
                                    <span>Banking Deadline:</span>
                                    <span>{member.bankingDeadline || "April 30, 2025"}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span>Banked Points Expiration:</span>
                                    <span>{member.expirationDate || "August 31, 2025"}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Recent Activity */}
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm">Recent Activity</h4>
                                <div className="bg-white p-3 rounded-md shadow-sm space-y-2 max-h-48 overflow-y-auto">
                                  {getMemberStays(member.name).length > 0 ? (
                                    getMemberStays(member.name)
                                      .slice(0, 2)
                                      .map((stay) => {
                                        const allocation = stay.allocation.find((a) => a.member === member.name)
                                        return (
                                          <div key={stay.id} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                                            <div className="flex justify-between">
                                              <span className="font-medium">{stay.resort}</span>
                                              <Badge variant={stay.status === "Completed" ? "outline" : "default"}>
                                                {stay.status}
                                              </Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground">{stay.dates}</div>
                                            <div className="text-xs mt-1">
                                              Used <span className="font-medium">{allocation?.points || 0}</span> points
                                            </div>
                                          </div>
                                        )
                                      })
                                  ) : (
                                    <div className="text-sm text-muted-foreground">No recent stays</div>
                                  )}

                                  {/* Use the improved PointAllocationHistory component */}
                                  <PointAllocationHistory memberName={member.name} limit={3} />
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 flex justify-end">
                              <Button variant="outline" size="sm" onClick={() => toggleMember(member.name)}>
                                Close Details
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <h3 className="text-sm font-medium mb-2">Understanding Point Allocation</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>
              <span className="font-medium">Current Year:</span> Points allocated for the current contract year
            </li>
            <li>
              <span className="font-medium">Banked from Previous Year:</span> Points banked from previous year that are
              available now but will expire at the end of the current contract year
            </li>
            <li>
              <span className="font-medium">Banked This Year:</span> Points banked in the current year that will be
              available starting next contract year
            </li>
            <li>
              <span className="font-medium">Borrowed/Lent:</span> Points transferred between family members
            </li>
            <li>
              <span className="font-medium">Available:</span> Total points available for booking (Current + Banked from
              Previous Year + Borrowed - Used - Lent)
            </li>
          </ul>
          <div className="mt-2 text-xs text-muted-foreground">
            Click on a member row to see detailed point calculation and recent activity
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
