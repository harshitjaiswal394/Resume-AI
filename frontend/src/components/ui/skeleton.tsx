import * as React from "react"
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-[var(--bg-muted)] rounded animate-pulse", className)}
      {...props}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="card space-y-4">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-20 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

export function SkeletonGauge() {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <Skeleton className="h-32 w-32 rounded-full" />
      <Skeleton className="h-4 w-24 mt-4" />
    </div>
  )
}

export function SkeletonJobCard() {
  return (
    <div className="card space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-2 w-2/3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-10 w-20 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  )
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  )
}

export { Skeleton }
