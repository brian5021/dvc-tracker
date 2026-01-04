import { DatabaseInitializer } from "@/components/database-initializer"
import { DatabaseCleanup } from "@/components/database-cleanup"

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#f5f8fa]">
      <header className="bg-[#1873cc] text-white py-6 px-4 md:px-6">
        <div className="container mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-blue-100">Disney Vacation Club Point Tracker</p>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 md:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <DatabaseInitializer visible={true} />
          <DatabaseCleanup />
        </div>
      </main>
    </div>
  )
}
