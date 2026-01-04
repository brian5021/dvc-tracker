import * as React from "react"

import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value, max = 100, ...props }, ref) => {
  const safeValue = isNaN(Number(value)) ? 0 : Number(value)
  const percentage = Math.min((safeValue / max) * 100, 100)

  return (
    <div
      ref={ref}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <div className="absolute left-0 top-0 h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
    </div>
  )
})
Progress.displayName = "Progress"

export { Progress }
