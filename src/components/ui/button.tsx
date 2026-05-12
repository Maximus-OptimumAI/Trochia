import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Trochia Button — themed to brand tokens (docs/DESIGN-REFERENCE.md § Buttons).
 *
 * Variants:
 *   - primary   bg-ink text-paper            — main CTA, one per surface
 *   - signal    bg-signal text-paper         — the ONE accent CTA per surface (use sparingly)
 *   - secondary bg-paper border border-stone — supporting actions
 *   - ghost     bg-transparent hover:bg-stone/50 — tertiary / nav-adjacent
 *   - link      hover:text-signal underline  — in-flow text actions
 *   - destructive bg-danger text-paper       — destructive confirm buttons
 *
 * Sizes: default h-11 (44px) · mobile h-12 (48px) · compact h-9 (36px). No `xs`
 * (small buttons read as toy — banned anti-pattern). Press state: active:scale-[0.98].
 *
 * `default` / `outline` aliases map to `primary` / `secondary` so shadcn-
 * generated components that reference them keep working.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-body-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ink/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink/90",
        signal: "bg-signal text-paper hover:bg-signal/90",
        secondary: "bg-paper text-ink border border-stone hover:border-ink/30",
        ghost: "bg-transparent text-ink hover:bg-stone/50",
        link: "text-ink underline-offset-4 hover:text-signal hover:underline px-0 h-auto",
        destructive: "bg-danger text-paper hover:bg-danger/90",
        // aliases for shadcn-generated component internals
        default: "bg-ink text-paper hover:bg-ink/90",
        outline: "bg-paper text-ink border border-stone hover:border-ink/30",
      },
      size: {
        default: "h-11 px-6",
        mobile: "h-12 px-6",
        compact: "h-9 px-4",
        // aliases
        sm: "h-9 px-4",
        lg: "h-12 px-6",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-compact": "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
