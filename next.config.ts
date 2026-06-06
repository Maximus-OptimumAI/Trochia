import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FOLLOWUP-SOURCEMAP-PROD-PUBLIC-HARDENING-01: never emit browser source maps
  // in the production build — a public `.map` under `.next/static/chunks/` would
  // leak original source / IP. This is also Next's default; setting it explicitly
  // makes the guarantee non-accidental. The `postbuild` assertion
  // (scripts/assert-no-public-sourcemaps.mjs) fails the build if a `.map` ever
  // reappears.
  //
  // NOTE: `withSentryConfig` (build-time source-map upload + release tagging +
  // tunnelRoute) is intentionally NOT wired here — it was stripped by a 404-debug
  // commit (16f29b2) and is tracked for a deliberate restore-and-test in
  // FOLLOWUP-SENTRY-BUILD-INTEGRATION-RESTORE-01. Do not re-add it without that.
  productionBrowserSourceMaps: false,
};

export default nextConfig;
