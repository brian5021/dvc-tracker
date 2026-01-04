"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { initializeDatabase } from "@/lib/actions"
import { toast } from "@/components/ui/use-toast"
import { RefreshCw } from "lucide-react"

export function DatabaseInitializer({ visible = false }: { visible?: boolean }) {
  const [initializing, setInitializing] = useState(false)

  const handleInitialize = async () => {
    if (!confirm("Are you sure you want to reset the database to its default state? This action cannot be undone.")) {
      return
    }

    try {
      setInitializing(true)
      const success = await initializeDatabase()

      if (success) {
        toast({
          title: "Database Initialized",
          description: "The database has been successfully reset to the default state.",
        })

        // Refresh the page to show the new data
        window.location.reload()
      } else {
        toast({
          title: "Initialization Failed",
          description: "Failed to initialize the database. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error initializing database:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred while initializing the database.",
        variant: "destructive",
      })
    } finally {
      setInitializing(false)
    }
  }

  if (!visible) return null

  return (
    <Button onClick={handleInitialize} disabled={initializing} className="bg-disney-blue hover:bg-blue-700">
      {initializing ? (
        <>
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Initializing...
        </>
      ) : (
        "Initialize Database"
      )}
    </Button>
  )
}
