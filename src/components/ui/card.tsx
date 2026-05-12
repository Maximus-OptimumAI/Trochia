import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Trochia Card — `bg-paper border border-stone rounded-xl p-8`. No shadow, no
 * lift on hover, no gradient (DESIGN-REFERENCE § Cards). Pass `interactive` for
 * `hover:border-ink/20`. `featured` → `border-2 border-signal` (the "Most
 * chosen" pricing variant); the absolute Signal badge top-right is the caller's
 * responsibility (use <CardAction> or position one yourself).
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
        "relative flex flex-col gap-6 rounded-xl bg-paper p-8 text-body text-ink transition-colors duration-150",
        featured ? "border-2 border-signal" : "border border-stone",
        interactive && !featured && "hover:border-ink/20",
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
      className={cn("absolute right-8 top-8", className)}
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
