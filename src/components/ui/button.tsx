import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Trochia Button — themed to brand tokens (docs/design/DESIGN.md §7 Buttons).
 * All variants are pills (rounded-full) — the only soft shape in the system.
 *
 * Variants:
 *   - signal    bg-signal text-INK + shadow-button — THE primary CTA, the surface's
 *               one Signal moment. Text is Ink, never paper/white (Ink-on-Signal
 *               5.8:1 AA; paper-on-signal 3.2:1 fails — DESIGN.md §10).
 *   - primary   bg-ink text-paper                  — app-shell workhorse primary
 *               (retired from marketing surfaces, where signal is the primary)
 *   - secondary bg-card border border-stone        — supporting actions ("white pill")
 *   - ghost     bg-transparent hover:bg-stone/50   — tertiary / nav-adjacent
 *   - link      hover:text-signal underline        — in-flow text actions
 *   - destructive bg-danger text-paper             — destructive confirm buttons
 *
 * Sizes: default h-11 (44px) · mobile h-12 (48px) · compact h-9 (36px). No `xs`
 * (small buttons read as toy — banned anti-pattern). Press state: active:scale-[0.98].
 *
 * `default` / `outline` aliases map to `primary` / `secondary` so shadcn-
 * generated components that reference them keep working.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-body-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ink/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink/90",
        signal: "bg-signal text-ink shadow-button hover:bg-signal/90",
        secondary: "bg-card text-ink border border-stone hover:border-ink/30",
        ghost: "bg-transparent text-ink hover:bg-stone/50",
        link: "text-ink underline-offset-4 hover:text-signal hover:underline px-0 h-auto",
        destructive: "bg-danger text-paper hover:bg-danger/90",
        // aliases for shadcn-generated component internals
        default: "bg-ink text-paper hover:bg-ink/90",
        outline: "bg-card text-ink border border-stone hover:border-ink/30",
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
  render,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      render={render}
      // render={<Link/>} (and other non-<button> renders) must opt out of
      // native-button semantics or Base UI logs a console error per instance
      nativeButton={nativeButton ?? !render}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
