"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"
import { AlertCircle, CalendarClock, RefreshCw, PiggyBank } from "lucide-react"
import { usePoints } from "@/context/point-context"
import { bankPoints } from "@/lib/actions"
import { isPastBankingDeadline } from "@/lib/utils/date-utils"

// Define the form schema
const formSchema = z.object({
  memberName: z.string().min(1, { message: "Please select a member" }),
  pointsToBankCount: z.coerce
    .number()
    .min(1, { message: "Points must be at least 1" })
    .max(230, { message: "Cannot bank more than 230 points" }),
})

type BankingFormValues = z.infer<typeof formSchema>

export function PointBanking() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { memberPoints, loading, error: contextError, refreshData } = usePoints()
  const [bankingDeadlinePassed, setBankingDeadlinePassed] = useState(isPastBankingDeadline())

  // Initialize the form
  const form = useForm<BankingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberName: "",
      pointsToBankCount: 0,
    },
    mode: "onChange",
  })

  // Get the selected member and points to bank
  const selectedMember = form.watch("memberName")
  const pointsToBankCount = form.watch("pointsToBankCount") || 0

  // Get the selected member's data
  const getMemberData = (memberName: string) => {
    if (!memberPoints) return null
    return memberPoints.find((m) => m.name === memberName)
  }

  const selectedMemberData = getMemberData(selectedMember)

  // Calculate maximum bankable points
  const safeMaxBankablePoints = selectedMemberData?.currentYearPoints || 0

  // Check if points exceed available
  const exceedsAvailable = pointsToBankCount > safeMaxBankablePoints

  // Ensure calculations for remaining points have fallbacks
  const safePointsToBankCount = pointsToBankCount || 0

  async function onSubmit(values: BankingFormValues) {
    try {
      setSubmitting(true)
      setError(null)

      // Call the banking service
      const result = await bankPoints(values.memberName, values.pointsToBankCount)

      if (result.success) {
        toast({
          title: "Points Banked Successfully",
          description: result.message,
        })

        // Reset form
        form.reset({
          memberName: "",
          pointsToBankCount: 0,
        })

        // Refresh data to show updated points
        await refreshData()
      } else {
        setError(result.message)
        toast({
          title: "Banking Failed",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error banking points:", error)
      setError("An unexpected error occurred. Please try again.")
      toast({
        title: "Error",
        description: "There was an error banking your points. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

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
        <Button onClick={refreshData} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Banking Form */}
        <Card>
          <CardHeader>
            <CardTitle>Bank Your Points</CardTitle>
            <CardDescription>Save your current year points for use in the next contract year</CardDescription>
          </CardHeader>
          <CardContent>
            {bankingDeadlinePassed ? (
              <Alert variant="warning" className="mb-4">
                <CalendarClock className="h-4 w-4" />
                <AlertTitle>Banking Deadline Passed</AlertTitle>
                <AlertDescription>
                  The banking deadline (April 30) has passed for this year. You'll be able to bank points again next
                  year.
                </AlertDescription>
              </Alert>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <FormField
                    control={form.control}
                    name="memberName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Member</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select member" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {memberPoints?.map((member) => (
                              <SelectItem key={member.name} value={member.name}>
                                {member.name} ({member.currentYearPoints} current year points)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pointsToBankCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Points to Bank</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value === "" ? "0" : e.target.value
                              field.onChange(Number(value))
                            }}
                            className={exceedsAvailable ? "border-red-500" : ""}
                            disabled={!selectedMember}
                          />
                        </FormControl>
                        <FormMessage />
                        {exceedsAvailable && (
                          <p className="text-xs text-red-500 mt-1">
                            Exceeds available current year points ({safeMaxBankablePoints})
                          </p>
                        )}
                      </FormItem>
                    )}
                  />

                  {selectedMemberData && (
                    <div className="p-4 bg-gray-50 rounded-md space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Current Year Points:</span>
                        <span>{selectedMemberData.currentYearPoints}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Already Banked This Year:</span>
                        <span>{selectedMemberData.pointsBeingBanked || 0}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Points to Bank Now:</span>
                        <span>{safePointsToBankCount}</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium pt-2 border-t">
                        <span>Remaining Current Year Points:</span>
                        <span>{Math.max(0, (selectedMemberData.currentYearPoints || 0) - safePointsToBankCount)}</span>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      submitting ||
                      exceedsAvailable ||
                      !form.formState.isValid ||
                      pointsToBankCount <= 0 ||
                      bankingDeadlinePassed
                    }
                  >
                    {submitting ? "Banking Points..." : "Bank Points"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        {/* Banking Information */}
        <Card>
          <CardHeader>
            <CardTitle>Banking Information</CardTitle>
            <CardDescription>Important information about banking your DVC points</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-medium">What is Banking?</h3>
              <p className="text-sm text-muted-foreground">
                Banking allows you to save your current year's points for use in the next contract year. This helps
                prevent points from expiring if you can't use them in the current year.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium">Banking Rules</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                <li>You must bank points by April 30th of the current contract year</li>
                <li>Banked points become available on September 1st of the next contract year</li>
                <li>Banked points must be used by August 31st of the next contract year or they will expire</li>
                <li>You can bank all or a portion of your current year points</li>
                <li>Once points are banked, this action cannot be undone</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium">Important Dates</h3>
              <div className="bg-gray-50 p-3 rounded-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Banking Deadline:</span>
                  <span className={bankingDeadlinePassed ? "text-red-500" : "text-green-500"}>
                    April 30, {new Date().getFullYear()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Banked Points Available:</span>
                  <span>September 1, {new Date().getFullYear()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Banked Points Expiration:</span>
                  <span>August 31, {new Date().getFullYear() + 1}</span>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <div className="text-sm text-muted-foreground">
              <PiggyBank className="h-4 w-4 inline-block mr-1" /> Banking points is a great way to plan for larger
              vacations in the future.
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Banking Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Banking Summary</CardTitle>
          <CardDescription>Overview of banked points for all family members</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Member</th>
                  <th className="text-right py-2">Current Year Points</th>
                  <th className="text-right py-2">Banked from Previous Year</th>
                  <th className="text-right py-2">Banked This Year</th>
                  <th className="text-right py-2">Available Next Year</th>
                </tr>
              </thead>
              <tbody>
                {memberPoints?.map((member) => (
                  <tr key={member.name} className="border-b">
                    <td className="py-2 font-medium" style={{ color: member.color }}>
                      {member.name}
                    </td>
                    <td className="text-right py-2">{member.currentYearPoints}</td>
                    <td className="text-right py-2 text-blue-600">{member.bankedPoints || 0}</td>
                    <td className="text-right py-2 text-amber-600">{member.pointsBeingBanked || 0}</td>
                    <td className="text-right py-2 font-medium">
                      {member.currentYearPoints + (member.pointsBeingBanked || 0)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  <td className="py-2">Total</td>
                  <td className="text-right py-2">
                    {memberPoints?.reduce((sum, m) => sum + m.currentYearPoints, 0) || 0}
                  </td>
                  <td className="text-right py-2 text-blue-600">
                    {memberPoints?.reduce((sum, m) => sum + (m.bankedPoints || 0), 0) || 0}
                  </td>
                  <td className="text-right py-2 text-amber-600">
                    {memberPoints?.reduce((sum, m) => sum + (m.pointsBeingBanked || 0), 0) || 0}
                  </td>
                  <td className="text-right py-2">
                    {memberPoints?.reduce((sum, m) => sum + m.currentYearPoints + (m.pointsBeingBanked || 0), 0) || 0}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
