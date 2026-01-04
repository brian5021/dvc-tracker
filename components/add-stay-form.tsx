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
import { cn } from "@/lib/utils"
import { format, differenceInDays, addDays } from "date-fns"
import { AlertCircle, CalendarIcon, RefreshCw } from "lucide-react"
import { addStay } from "@/lib/actions"
import { useRouter } from "next/navigation"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePoints } from "@/context/point-context"

// Define the schema outside the component
const formSchema = z
  .object({
    resort: z.string().min(1, { message: "Please select a resort" }),
    checkIn: z.date({ required_error: "Please select a check-in date" }),
    checkOut: z.date({ required_error: "Please select a check-out date" }),
    roomType: z.string().min(1, { message: "Please select a room type" }),
    totalPoints: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 1, {
      message: "Points must be at least 1",
    }),
    brianPoints: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Points cannot be negative",
    }),
    rachelPoints: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Points cannot be negative",
    }),
    parentsPoints: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Points cannot be negative",
    }),
    status: z.string().min(1, { message: "Please select a status" }),
  })
  .refine(
    (data) => {
      // Only validate if both dates are defined
      if (!data.checkIn || !data.checkOut) return true
      return differenceInDays(data.checkOut, data.checkIn) > 0
    },
    {
      message: "Check-out date must be after check-in date",
      path: ["checkOut"],
    },
  )
  .refine(
    (data) => {
      const totalAllocated = Number(data.brianPoints) + Number(data.rachelPoints) + Number(data.parentsPoints)
      return totalAllocated === Number(data.totalPoints)
    },
    {
      message: "Allocated points must equal total points",
      path: ["totalPoints"],
    },
  )

type StayFormValues = z.infer<typeof formSchema>

export function AddStayForm() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Use the context instead of local state
  const { memberPoints, loading, error: contextError, refreshStays } = usePoints()
  const router = useRouter()

  // Set default dates for the form
  const today = new Date()
  const tomorrow = addDays(today, 1)

  // Initialize the form with default dates
  const form = useForm<StayFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      resort: "",
      checkIn: today,
      checkOut: tomorrow,
      roomType: "",
      totalPoints: "",
      brianPoints: "",
      rachelPoints: "",
      parentsPoints: "",
      status: "",
    },
  })

  async function onSubmit(values: StayFormValues) {
    try {
      setSubmitting(true)
      setError(null)

      // Convert string values to numbers
      const totalPointsNum = Number(values.totalPoints)
      const brianPointsNum = Number(values.brianPoints)
      const rachelPointsNum = Number(values.rachelPoints)
      const parentsPointsNum = Number(values.parentsPoints)

      // Format dates for display
      const formattedCheckIn = format(values.checkIn, "MMM d, yyyy")
      const formattedCheckOut = format(values.checkOut, "MMM d, yyyy")
      const dates = `${formattedCheckIn} - ${formattedCheckOut}`

      // Calculate nights
      const nights = differenceInDays(values.checkOut, values.checkIn)

      // Create allocation array
      const allocation = []
      if (brianPointsNum > 0) {
        allocation.push({ member: "Brian", points: brianPointsNum })
      }
      if (rachelPointsNum > 0) {
        allocation.push({ member: "Rachel", points: rachelPointsNum })
      }
      if (parentsPointsNum > 0) {
        allocation.push({ member: "Parents", points: parentsPointsNum })
      }

      // Create stay object
      const stay = {
        resort: values.resort,
        dates,
        nights,
        points: totalPointsNum,
        status: values.status as any,
        allocation,
        checkIn: format(values.checkIn, "yyyy-MM-dd"),
        checkOut: format(values.checkOut, "yyyy-MM-dd"),
        roomType: values.roomType,
      }

      // Save to Redis using server action
      const result = await addStay(stay)

      if (result.success) {
        toast({
          title: "Stay Added",
          description: "Your stay has been successfully added and points have been allocated.",
        })

        // Reset form
        form.reset({
          resort: "",
          checkIn: today,
          checkOut: tomorrow,
          roomType: "",
          totalPoints: "",
          brianPoints: "",
          rachelPoints: "",
          parentsPoints: "",
          status: "",
        })

        // Refresh the stays data
        await refreshStays()

        // Refresh the page to show the new stay
        router.refresh()
      } else {
        setError(result.message)
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding stay:", error)
      setError("An unexpected error occurred. Please try again.")
      toast({
        title: "Error",
        description: "There was an error adding your stay. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Get form values safely and convert to numbers for calculations
  const totalPoints = form.watch("totalPoints") ? Number(form.watch("totalPoints")) : 0
  const brianPoints = form.watch("brianPoints") ? Number(form.watch("brianPoints")) : 0
  const rachelPoints = form.watch("rachelPoints") ? Number(form.watch("rachelPoints")) : 0
  const parentsPoints = form.watch("parentsPoints") ? Number(form.watch("parentsPoints")) : 0
  const checkIn = form.watch("checkIn")

  // Ensure all calculations have proper fallbacks
  // Make sure all numeric values are properly converted and have fallbacks
  const safeAllocatedPoints = brianPoints + rachelPoints + parentsPoints
  const safeRemainingPoints = totalPoints - safeAllocatedPoints

  // Get available points for each member
  const getAvailablePoints = (memberName: string): number => {
    if (!memberPoints) return 0
    const member = memberPoints.find((m) => m.name === memberName)
    return member ? member.available : 0
  }

  const brianAvailable = getAvailablePoints("Brian")
  const rachelAvailable = getAvailablePoints("Rachel")
  const parentsAvailable = getAvailablePoints("Parents")

  // Check if allocation exceeds available points
  const brianExceeded = brianPoints > brianAvailable
  const rachelExceeded = rachelPoints > rachelAvailable
  const parentsExceeded = parentsPoints > parentsAvailable
  const anyExceeded = brianExceeded || rachelExceeded || parentsExceeded

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center">
        <div className="animate-pulse bg-gray-200 h-4 w-3/4 rounded"></div>
      </div>
    )
  }

  if ((contextError || error) && !memberPoints) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{contextError || error}</AlertDescription>
        <Button onClick={refreshStays} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </Alert>
    )
  }

  return (
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
            name="resort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resort</FormLabel>
                <FormControl>
                  <select className="w-full p-2 border rounded-md" {...field}>
                    <option value="">Select a resort</option>
                    <option value="Disney's Polynesian Villas & Bungalows">
                      Disney's Polynesian Villas & Bungalows
                    </option>
                    <option value="Disney's Grand Floridian Resort & Spa">Disney's Grand Floridian Resort & Spa</option>
                    <option value="Disney's Beach Club Villas">Disney's Beach Club Villas</option>
                    <option value="Disney's BoardWalk Villas">Disney's BoardWalk Villas</option>
                    <option value="Disney's Animal Kingdom Villas">Disney's Animal Kingdom Villas</option>
                    <option value="Disney's Wilderness Lodge">Disney's Wilderness Lodge</option>
                    <option value="Disney's Riviera Resort">Disney's Riviera Resort</option>
                    <option value="Disney's Saratoga Springs">Disney's Saratoga Springs</option>
                    <option value="Disney's Old Key West">Disney's Old Key West</option>
                    <option value="Other">Other</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="roomType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Room Type</FormLabel>
                <FormControl>
                  <select className="w-full p-2 border rounded-md" {...field}>
                    <option value="">Select a room type</option>
                    <option value="studio">Deluxe Studio</option>
                    <option value="one_bedroom">One-Bedroom Villa</option>
                    <option value="two_bedroom">Two-Bedroom Villa</option>
                    <option value="three_bedroom">Three-Bedroom Villa</option>
                    <option value="cabin">Cabin</option>
                    <option value="bungalow">Bungalow</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="checkIn"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Check-in Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => field.onChange(date || today)}
                      initialFocus
                      disabled={(date) => date < today}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="checkOut"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Check-out Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => field.onChange(date || tomorrow)}
                      initialFocus
                      disabled={(date) => (checkIn ? date <= checkIn : date <= today)}
                      fromDate={checkIn ? addDays(checkIn, 1) : addDays(today, 1)}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="totalPoints"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total Points</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={field.value}
                    onChange={(e) => {
                      // Just update with the raw value from the input
                      field.onChange(e.target.value)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reservation Status</FormLabel>
                <FormControl>
                  <select className="w-full p-2 border rounded-md" {...field}>
                    <option value="">Select status</option>
                    <option value="Planning">Planning</option>
                    <option value="Waitlisted">Waitlisted</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Point Allocation</h3>
            <p className="text-sm text-muted-foreground">Allocate the {totalPoints} points among family members</p>
          </div>

          {memberPoints && (
            <div className="grid gap-4 md:grid-cols-3">
              {memberPoints.map((member) => (
                <Card key={member.name} className={member.available < 10 ? "border-amber-300" : ""}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{member.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{member.available}</div>
                    <p className="text-sm text-muted-foreground">points available</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="brianPoints"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brian's Points</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={field.value}
                      onChange={(e) => {
                        // Just update with the raw value from the input
                        field.onChange(e.target.value)
                      }}
                      className={brianExceeded ? "border-red-500" : ""}
                    />
                  </FormControl>
                  <FormMessage />
                  {brianExceeded && (
                    <p className="text-xs text-red-500 mt-1">Exceeds available points ({brianAvailable})</p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rachelPoints"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rachel's Points</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={field.value}
                      onChange={(e) => {
                        // Just update with the raw value from the input
                        field.onChange(e.target.value)
                      }}
                      className={rachelExceeded ? "border-red-500" : ""}
                    />
                  </FormControl>
                  <FormMessage />
                  {rachelExceeded && (
                    <p className="text-xs text-red-500 mt-1">Exceeds available points ({rachelAvailable})</p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parentsPoints"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parents' Points</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={field.value}
                      onChange={(e) => {
                        // Just update with the raw value from the input
                        field.onChange(e.target.value)
                      }}
                      className={parentsExceeded ? "border-red-500" : ""}
                    />
                  </FormControl>
                  <FormMessage />
                  {parentsExceeded && (
                    <p className="text-xs text-red-500 mt-1">Exceeds available points ({parentsAvailable})</p>
                  )}
                </FormItem>
              )}
            />
          </div>

          <div
            className={`p-4 rounded-md ${
              safeRemainingPoints === 0 && !anyExceeded ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            <div className="flex justify-between">
              <span>Total Allocated:</span>
              <span>{safeAllocatedPoints} points</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Remaining to Allocate:</span>
              <span>{safeRemainingPoints} points</span>
            </div>
            {anyExceeded && (
              <div className="mt-2 text-red-600 text-sm">
                Warning: One or more members don't have enough available points
              </div>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={safeRemainingPoints !== 0 || submitting || anyExceeded || !form.formState.isValid}
        >
          {submitting ? "Adding Stay..." : "Add Stay"}
        </Button>
      </form>
    </Form>
  )
}

