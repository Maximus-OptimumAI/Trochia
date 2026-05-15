#!/usr/bin/env bash
# Pre-push gate. Loads .env.test, verifies integration-test DB is reachable,
# then runs the full pre-push suite. Prevents local-vs-CI divergence
# (e.g. the PR-4 surprise where local pre-push was green only because
# TEST_DATABASE_URL wasn't set and integration tests silently skipped).

set -euo pipefail

# Load .env.test if it exists
if [ -f .env.test ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.test
  set +a
  echo "✓ loaded .env.test"
else
  echo "⚠ .env.test not found — integration tests will skip"
fi

# Verify the integration-test DB var is loaded
if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo ""
  echo "❌ TEST_DATABASE_URL is not set."
  echo "   Integration tests (Stripe webhook idempotency, RLS isolation,"
  echo "   accounts.owner_user_id uniqueness) will silently skip."
  echo "   CI has this env var set — pushing without it risks the same"
  echo "   divergence that killed PR-4."
  echo ""
  echo "   Fix: populate .env.test with trochia-test-ci credentials."
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Pre-push gate — typecheck → lint → test → banned-strings"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "▶ typecheck"
npm run typecheck

echo ""
echo "▶ lint"
npm run lint

echo ""
echo "▶ test (with TEST_DATABASE_URL loaded — integration tests will run)"
npm run test

echo ""
echo "▶ check:banned"
npm run check:banned

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Pre-push gate passed. Safe to push."
echo "═══════════════════════════════════════════════════════════"
