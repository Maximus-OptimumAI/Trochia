import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Trochia Badge — `rounded-full` pill. Badges NEVER carry Signal (docs/design/
 * DESIGN.md §7 Badges — Signal on a badge would spend the surface's accent
 * moment). Variants:
 *   - default   bg-ink text-paper            — generic ("New")
 *   - signal    NEUTRAL ("Most chosen") — text-graphite on Card per the §7
 *               featured-card spec; the variant NAME survives for call-site
 *               compatibility, the styling is deliberately not Signal
 *   - phase     bg-transparent text-graphite — disabled-nav phase tags ("Phase 7"), mono-sm
 *   - outline   border-stone text-graphite   — neutral
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-mono-sm font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper",
        signal: "bg-card text-graphite border-stone",
        phase: "bg-transparent text-graphite px-1.5",
        outline: "border-stone text-graphite",
        // alias kept for shadcn-generated internals
        secondary: "bg-stone text-ink",
        destructive: "bg-danger text-paper",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
