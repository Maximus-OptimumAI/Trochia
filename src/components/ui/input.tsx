import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Trochia Input — SHARP corners (docs/design/DESIGN.md §7 Inputs): the 0px input
 * beside a pill button is the system's signature tension. `bg-paper border
 * border-stone rounded-none h-11 px-4 text-body`, `placeholder:text-graphite`,
 * focus → `border-ink` (no ring), error → `border-danger` (set `aria-invalid`,
 * or pass `border-danger` via className). Pass `bg-card` when inside a white band.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-none border border-stone bg-paper px-4 text-body text-ink transition-colors outline-none placeholder:text-graphite focus-visible:border-ink disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
