"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { AlertCircle, CalendarIcon, RefreshCw, Check, ArrowRight } from "lucide-react"
import type { PointTransfer } from "@/lib/types"
import { addTransfer, updateTransferStatus } from "@/lib/actions"
import { useRouter } from "next/navigation"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Add this import
import { usePoints } from "@/context/point-context"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const formSchema = z.object({
  fromMember: z.string().min(1, { message: "Please select a member" }),
  toMember: z.string().min(1, { message: "Please select a member" }),
  points: z.coerce.number().min(1, { message: "Points must be at least 1" }),
  useYear: z.string().min(1, { message: "Please select a use year" }),
  transferDate: z.date({ required_error: "Please select a transfer date" }),
  notes: z.string().optional(),
})

type TransferFormValues = z.infer<typeof formSchema>

export function PointTransfers() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Use the context instead of local state
  const { memberPoints, transfers, loading, error: contextError, refreshTransfers } = usePoints()
  const [selectedTransfer, setSelectedTransfer] = useState<PointTransfer | null>(null)
  const [confirmingReturn, setConfirmingReturn] = useState<string | null>(null)
  const router = useRouter()

  // Remove the loadData function and useEffect since we're using context

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fromMember: "",
      toMember: "",
      points: 0,
      useYear: new Date().getFullYear().toString(),
      notes: "",
    },
  })

  async function onSubmit(values: TransferFormValues) {
    try {
      setSubmitting(true)
      setError(null)

      // Calculate return date (September 1 of the next year)
      const nextYear = new Date().getFullYear() + 1
      const returnDate = `${nextYear}-09-01`

      // Create transfer object
      const transfer = {
        fromMember: values.fromMember as any,
        toMember: values.toMember as any,
        points: values.points,
        useYear: values.useYear,
        transferDate: format(values.transferDate, "yyyy-MM-dd"),
        returnDate,
        status: "Active" as const,
        notes: values.notes || `Points transferred from ${values.fromMember} to ${values.toMember}`,
      }

      // Save to Redis using server action
      const result = await addTransfer(transfer)

      if (result.success) {
        toast({
          title: "Transfer Completed",
          description: "Points have been successfully transferred.",
        })

        // Reset form
        form.reset({
          fromMember: "",
          toMember: "",
          points: 0,
          useYear: new Date().getFullYear().toString(),
          notes: "",
        })

        // Refresh transfers data
        await refreshTransfers()
      } else {
        setError(result.message)
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding transfer:", error)
      setError("An unexpected error occurred. Please try again.")
      toast({
        title: "Error",
        description: "There was an error processing your transfer. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReturnPoints(transferId: string) {
    try {
      setSubmitting(true)
      const result = await updateTransferStatus(transferId, "Returned")

      if (result.success) {
        toast({
          title: "Points Returned",
          description: "The points have been successfully returned to the original owner.",
        })

        // Refresh transfers data
        await refreshTransfers()

        // Force a page refresh to ensure all components update
        router.refresh()
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error returning points:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred while returning points.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
      setConfirmingReturn(null)
    }
  }

  const fromMember = form.watch("fromMember")
  const toMember = form.watch("toMember")
  const points = form.watch("points") || 0

  // Get available points for the selected member
  const getAvailablePoints = (memberName: string): number => {
    if (!memberPoints) return 0
    const member = memberPoints?.find((m) => m.name === memberName)
    return member ? member.available : 0
  }

  const fromMemberAvailable = getAvailablePoints(fromMember)
  const pointsExceedAvailable = points > fromMemberAvailable

  // Check if from and to members are the same
  const sameMembers = fromMember && toMember && fromMember === toMember

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <div className="animate-pulse bg-gray-200 h-4 w-3/4 rounded"></div>
      </div>
    )
  }

  if ((contextError || error) && (!memberPoints || !transfers)) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{contextError || error}</AlertDescription>
        <Button onClick={refreshTransfers} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </Alert>
    )
  }

  return (
    <Tabs defaultValue="active">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="active">Active Transfers</TabsTrigger>
        <TabsTrigger value="history">Transfer History</TabsTrigger>
        <TabsTrigger value="new">New Transfer</TabsTrigger>
      </TabsList>

      <TabsContent value="active" className="pt-4">
        <Card>
          <CardHeader>
            <CardTitle>Active Point Transfers</CardTitle>
          </CardHeader>
          <CardContent>
            {transfers && transfers.filter((t) => t.status === "Active").length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Use Year</TableHead>
                      <TableHead>Transfer Date</TableHead>
                      <TableHead>Return By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers
                      .filter((transfer) => transfer.status === "Active")
                      .map((transfer) => (
                        <TableRow key={transfer.id}>
                          <TableCell>{transfer.fromMember}</TableCell>
                          <TableCell>{transfer.toMember}</TableCell>
                          <TableCell className="font-medium">{transfer.points}</TableCell>
                          <TableCell>{transfer.useYear}</TableCell>
                          <TableCell>{transfer.transferDate}</TableCell>
                          <TableCell>{transfer.returnDate}</TableCell>
                          <TableCell>
                            <Badge className="bg-green-500">
                              <Check className="w-3 h-3 mr-1" /> Active
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => setConfirmingReturn(transfer.id)}>
                              Return Points
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No active transfers found.</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="history" className="pt-4">
        <Card>
          <CardHeader>
            <CardTitle>Transfer History</CardTitle>
          </CardHeader>
          <CardContent>
            {transfers && transfers.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>Use Year</TableHead>
                      <TableHead>Transfer Date</TableHead>
                      <TableHead>Return Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers
                      .sort((a, b) => b.createdAt - a.createdAt) // Sort by newest first
                      .map((transfer) => (
                        <TableRow key={transfer.id}>
                          <TableCell>{transfer.fromMember}</TableCell>
                          <TableCell>{transfer.toMember}</TableCell>
                          <TableCell className="font-medium">{transfer.points}</TableCell>
                          <TableCell>{transfer.useYear}</TableCell>
                          <TableCell>{transfer.transferDate}</TableCell>
                          <TableCell>{transfer.returnDate}</TableCell>
                          <TableCell>
                            {transfer.status === "Active" ? (
                              <Badge className="bg-green-500">
                                <Check className="w-3 h-3 mr-1" /> Active
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <Check className="w-3 h-3 mr-1" /> Returned
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="text-left">
                                  {transfer.notes && transfer.notes.length > 30
                                    ? `${transfer.notes.substring(0, 30)}...`
                                    : transfer.notes}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <p>{transfer.notes}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No transfers found.</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="new" className="pt-4">
        <Card>
          <CardHeader>
            <CardTitle>New Point Transfer</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="fromMember"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Member</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select member" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Brian">Brian</SelectItem>
                            <SelectItem value="Rachel">Rachel</SelectItem>
                            <SelectItem value="Parents">Parents</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="toMember"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>To Member</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select member" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Brian">Brian</SelectItem>
                            <SelectItem value="Rachel">Rachel</SelectItem>
                            <SelectItem value="Parents">Parents</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                        {sameMembers && (
                          <p className="text-xs text-red-500 mt-1">Cannot transfer points to the same member</p>
                        )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="points"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Points to Transfer</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className={pointsExceedAvailable ? "border-red-500" : ""}
                          />
                        </FormControl>
                        <FormMessage />
                        {pointsExceedAvailable && (
                          <p className="text-xs text-red-500 mt-1">Exceeds available points ({fromMemberAvailable})</p>
                        )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="useYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Use Year</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select use year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={(new Date().getFullYear() - 1).toString()}>
                              {new Date().getFullYear() - 1}
                            </SelectItem>
                            <SelectItem value={new Date().getFullYear().toString()}>
                              {new Date().getFullYear()}
                            </SelectItem>
                            <SelectItem value={(new Date().getFullYear() + 1).toString()}>
                              {new Date().getFullYear() + 1}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="transferDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Transfer Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground",
                                )}
                              >
                                {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes (Optional)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Purpose of transfer" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {fromMember && (
                  <div className="p-4 bg-gray-50 rounded-md">
                    <h4 className="font-medium mb-2">Transfer Summary</h4>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{fromMember}</span>
                      <ArrowRight className="h-4 w-4" />
                      <span className="font-medium">{toMember || "..."}</span>
                      <span className="ml-auto">{points} points</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Points will be returned by September 1st of the next year.
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    submitting || pointsExceedAvailable || sameMembers || !form.formState.isValid || points <= 0
                  }
                >
                  {submitting ? "Processing..." : "Transfer Points"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Confirmation Dialog for Returning Points */}
      <Dialog open={!!confirmingReturn} onOpenChange={(open) => !open && setConfirmingReturn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Point Return</DialogTitle>
            <DialogDescription>
              Are you sure you want to return these points to the original owner? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingReturn(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={() => confirmingReturn && handleReturnPoints(confirmingReturn)}
              disabled={submitting}
            >
              {submitting ? "Processing..." : "Return Points"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Details Dialog */}
      <Dialog open={!!selectedTransfer} onOpenChange={(open) => !open && setSelectedTransfer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Details</DialogTitle>
          </DialogHeader>
          {selectedTransfer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium">From</h3>
                  <p>{selectedTransfer.fromMember}</p>
                </div>
                <div>
                  <h3 className="font-medium">To</h3>
                  <p>{selectedTransfer.toMember}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium">Points</h3>
                  <p>{selectedTransfer.points}</p>
                </div>
                <div>
                  <h3 className="font-medium">Use Year</h3>
                  <p>{selectedTransfer.useYear}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium">Transfer Date</h3>
                  <p>{selectedTransfer.transferDate}</p>
                </div>
                <div>
                  <h3 className="font-medium">Return By</h3>
                  <p>{selectedTransfer.returnDate}</p>
                </div>
              </div>
              {selectedTransfer.notes && (
                <div>
                  <h3 className="font-medium">Notes</h3>
                  <p>{selectedTransfer.notes}</p>
                </div>
              )}
              <div>
                <h3 className="font-medium">Status</h3>
                <div className="mt-1">
                  {selectedTransfer.status === "Active" ? (
                    <Badge className="bg-green-500">
                      <Check className="w-3 h-3 mr-1" /> Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <Check className="w-3 h-3 mr-1" /> Returned
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSelectedTransfer(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
