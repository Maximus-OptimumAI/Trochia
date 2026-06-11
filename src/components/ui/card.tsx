import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Trochia Card — borderless white surface on the Paper canvas (docs/design/
 * DESIGN.md §7 Cards): `bg-card rounded-3xl p-6 shadow-card`. The flush shadow
 * defines the edge, it doesn't lift — no border, no hover-lift, no gradient.
 * Pass `interactive` for a one-step shadow deepen. `featured` → `ring-2
 * ring-signal` (the "Most chosen" pricing variant — the ring IS that page's
 * Signal moment; pair it with a NEUTRAL badge, never a Signal one).
 */
function Card({
  className,
  interactive = false,
  featured = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean; featured?: boolean }) {
  return (
    <div
      data-slot="card"
      data-featured={featured || undefined}
      className={cn(
        "relative flex flex-col gap-6 rounded-3xl bg-card p-6 text-body text-ink shadow-card",
        featured && "ring-2 ring-signal",
        interactive && "transition-shadow duration-150 hover:shadow-overlay",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-h3 font-geist text-ink", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-body-sm text-graphite", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("absolute right-6 top-6", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center pt-2", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
