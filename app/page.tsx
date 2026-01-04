import { PointSummary } from "@/components/point-summary"
import { StayTable } from "@/components/stay-table"
import { PointAllocation } from "@/components/point-allocation"
import { AddStayForm } from "@/components/add-stay-form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PointTransfers } from "@/components/point-transfers"
import { PointBanking } from "@/components/point-banking"
import { SecretAdmin } from "@/components/secret-admin"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f5f8fa]">
      <header className="bg-[#1873cc] text-white py-6 px-4 md:px-6">
        <div className="container mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold">Disney Vacation Club Point Tracker</h1>
          <p className="text-blue-100">Family of Brian, Rachel, Dan & Beth</p>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 md:px-6">
        <PointSummary />

        <Tabs defaultValue="stays" className="mt-8">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="stays">Planned Stays</TabsTrigger>
            <TabsTrigger value="allocation">Point Allocation</TabsTrigger>
            <TabsTrigger value="transfers">Point Transfers</TabsTrigger>
            <TabsTrigger value="banking">Point Banking</TabsTrigger>
            <TabsTrigger value="add">Add New Stay</TabsTrigger>
          </TabsList>

          <TabsContent value="stays" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Planned & Executed Stays</CardTitle>
                <CardDescription>View all upcoming and past DVC stays with point details</CardDescription>
              </CardHeader>
              <CardContent>
                <StayTable />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="allocation" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Family Point Allocation</CardTitle>
                <CardDescription>See how points are distributed among family members</CardDescription>
              </CardHeader>
              <CardContent>
                <PointAllocation />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transfers" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Point Transfers</CardTitle>
                <CardDescription>Track points borrowed or lent between family members</CardDescription>
              </CardHeader>
              <CardContent>
                <PointTransfers />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banking" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Point Banking</CardTitle>
                <CardDescription>Save current year points for use in the next contract year</CardDescription>
              </CardHeader>
              <CardContent>
                <PointBanking />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Add New Stay</CardTitle>
                <CardDescription>Record a new planned or completed DVC stay</CardDescription>
              </CardHeader>
              <CardContent>
                <AddStayForm />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="bg-gray-100 py-6 px-4 md:px-6 mt-8">
        <div className="container mx-auto text-center text-gray-600">
          <SecretAdmin />
        </div>
      </footer>
    </div>
  )
}

