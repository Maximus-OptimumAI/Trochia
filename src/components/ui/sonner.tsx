"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Trochia Toaster (Sonner) — bottom-right, brand-themed, light only. No
 * decorative icons; copy is a plain statement of what happened ("Deck
 * uploaded." / "Couldn't upload your deck."). Auto-dismiss ~4s. Mount once near
 * the app root.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      duration={4000}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)", // paper
          "--normal-text": "var(--popover-foreground)", // ink
          "--normal-border": "var(--border)", // stone
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
