"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"

import { cn } from "@/lib/utils"

/**
 * Trochia RadioGroup — thin wrapper around @base-ui/react/radio-group + radio.
 *
 * Used by the conflict resolver (KNW-02c) to surface multi-candidate provenance:
 * the founder picks one canonical value before the per-field Confirm action
 * unlocks. The visual treatment is the standard inputs-and-fields set —
 * 16x16 circle, 1px `border-stone`, `bg-paper`; checked state fills with
 * `bg-ink` via a centered indicator dot. No traffic-light coloring; selection
 * is communicated through the inked dot + the option container's own
 * `border-ink/30` ring (handled by the caller's layout, not the primitive).
 *
 * a11y: base-ui handles arrow-key cycling, focus management, and the hidden
 * <input> the form layer consumes. Caller is responsible for wrapping the
 * group in a fieldset/legend pair (or supplying an aria-label) plus
 * aria-describedby on each item linking to its source-snippet block.
 *
 * No new design tokens introduced. Brand-tokens-only Tailwind.
 */

function RadioGroup({
  className,
  ...props
}: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        // 16x16 circle, stone border, paper fill; ink-ring on focus-visible
        "relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-stone bg-paper transition-colors outline-none",
        "hover:border-ink/30",
        "focus-visible:ring-2 focus-visible:ring-ink/40",
        // Checked state: the indicator fills; border deepens to ink.
        "data-[checked]:border-ink",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2 rounded-full bg-ink"
      />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
