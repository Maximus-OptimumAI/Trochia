"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

/**
 * Trochia Collapsible — thin wrapper around @base-ui/react/collapsible.
 * Used by the per-field confirmation card to disclose the verbatim
 * `source_snippet` quote from the paste. Trigger is rendered as a small mono
 * link affordance ("source ▾"); Panel reveals the snippet in a stone-bordered
 * block. No animation beyond the duration-150 color transition the rest of
 * the system uses — DESIGN-REFERENCE bans physics-based motion.
 */
function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  className,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm text-graphite underline-offset-4 outline-none transition-colors hover:text-ink hover:underline focus-visible:text-ink focus-visible:underline",
        className,
      )}
      {...props}
    />
  )
}

function CollapsiblePanel({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn(
        "overflow-hidden text-body-sm text-graphite transition-[height] duration-150 data-[ending-style]:h-0 data-[starting-style]:h-0",
        className,
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel }
