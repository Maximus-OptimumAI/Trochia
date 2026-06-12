/**
 * Marketing route template — the §9 page-enter (200ms ease-out fade-up) on
 * every navigation. A template (not layout) so it remounts per route change.
 * CSS-animation only: completes without JS, and the reduced-motion
 * kill-switch in globals.css collapses it to instant.
 */
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
