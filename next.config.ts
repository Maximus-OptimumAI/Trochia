import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Wrap with `withSentryConfig` (FND-07 / D-13): source-map upload at build time
 * (auth via `SENTRY_AUTH_TOKEN` / org+project slugs), wider client file upload,
 * a tunnel route to dodge ad-blockers, and console-logger suppression. When the
 * Sentry build-time vars are unset (local dev), the plugin is a quiet no-op.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Only print build-time logs in CI.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Route Sentry requests through the app to dodge ad-blockers.
  tunnelRoute: "/monitoring",
  // Tree-shake Sentry's logger statements in production.
  disableLogger: true,
});
