#!/usr/bin/env bash
#
# smoke.sh - post-build smoke test. Builds the app, boots the PROD server
# (`next start`), curls the key routes, checks status codes + headers, prints
# one PASS/FAIL line per check, then shuts the server down.
#
# The route set is the app's CI route surface: Lighthouse hits `/`; the
# Playwright e2e specs (e2e/**, tests/e2e/**) drive the rest. This mirrors that
# surface so a green smoke ≈ the routes CI exercises are actually up.
#
# TWO KNOWN 401 SOURCES - on any 401 the script inspects the response headers
# and names which gate it hit:
#   1. Vercel SSO / deployment protection - an unauthenticated request to a
#      protected preview/prod deploy. Signature: a `_vercel_sso_nonce` Set-Cookie
#      (and/or `server: Vercel` with no Basic challenge). Fix = disable protection
#      for the URL or hit it with a bypass token, not a code change.
#   2. App basic-auth gate - an HTTP Basic challenge in front of the app (staging
#      host guard). Signature: `WWW-Authenticate: Basic realm=...`. Fix = supply
#      credentials (curl -u) or lift the gate.
#   Neither header present on a 401 → it's the app's own `UNAUTHORIZED`
#   (src/lib/errors.ts, code=UNAUTHORIZED) - a real app response, not an edge gate.
#
# USAGE
#   bash scripts/smoke.sh                 # build + start local prod server on :3100, smoke it
#   SMOKE_SKIP_BUILD=1 bash scripts/smoke.sh   # reuse existing .next, skip `npm run build`
#   SMOKE_PORT=3200 bash scripts/smoke.sh      # start the local prod server on a different port
#   SMOKE_BASE_URL=https://trochia-xyz.vercel.app bash scripts/smoke.sh
#                                          # smoke a REMOTE url (no build/start); this is where
#                                          # the 401 classifier earns its keep.
#
# SAFE: read-only HTTP GETs. It never writes. Gated routes are hit UNauthenticated
# (no cookie) so they just redirect. It never prints a secret.
#
# Exit: 0 = all checks passed, 1 = one or more FAIL (or build/boot failure).
set -u

# ── Locate repo root (parent of this script's dir) ───────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT" || { echo "cannot cd to repo root"; exit 1; }

# ── Config ───────────────────────────────────────────────────────────────────
PORT="${SMOKE_PORT:-3100}"
TIMEOUT="${SMOKE_TIMEOUT:-15}"
DEV_PORT=3000                              # `next dev` default - build must not collide with it
if [ -n "${SMOKE_BASE_URL:-}" ]; then
  BASE_URL="${SMOKE_BASE_URL%/}"           # trailing-slash-normalized remote target
  EXTERNAL=1
else
  BASE_URL="http://localhost:$PORT"
  EXTERNAL=0
fi

# Display-only, credential-stripped form of the target. A remote SMOKE_BASE_URL
# can carry basic-auth userinfo (https://user:pass@host); this drops the
# `userinfo@` between scheme and host so the password never reaches stdout or a
# CI log. Requests still use the full BASE_URL; only the printed form is redacted
# (mirrors the host-only redaction in scripts/env-preflight.sh).
BASE_URL_SAFE="$(printf '%s' "$BASE_URL" | sed -E 's#^(https?://)[^/@]*@#\1#')"

# ── Colors (respect NO_COLOR / non-tty) ──────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; X=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; D=''; X=''
fi

SRV_PID=""
SRV_LOG="$(mktemp 2>/dev/null || echo "$ROOT/.smoke-server.log")"

cleanup() {
  if [ -n "$SRV_PID" ] && kill -0 "$SRV_PID" 2>/dev/null; then
    echo ""
    echo "${D}shutting down prod server (pid $SRV_PID)…${X}"
    kill "$SRV_PID" 2>/dev/null
    for _ in 1 2 3 4 5; do kill -0 "$SRV_PID" 2>/dev/null || break; sleep 1; done
    kill -9 "$SRV_PID" 2>/dev/null
  fi
  [ -f "$SRV_LOG" ] && rm -f "$SRV_LOG" 2>/dev/null
}
trap cleanup EXIT INT TERM

echo ""
echo "${B}═══ smoke test ═══${X}  ${D}target: $BASE_URL_SAFE${X}"
echo ""

# ── Build + boot (skipped in EXTERNAL mode) ──────────────────────────────────
if [ "$EXTERNAL" = "0" ]; then
  if [ -z "${SMOKE_SKIP_BUILD:-}" ]; then
    # LESSON GUARD: never `npm run build` while `next dev` is running - they share
    # the .next dir and corrupt each other. If something answers on :3000, assume
    # a dev server and refuse unless explicitly forced.
    if curl -sS -o /dev/null -m 3 "http://localhost:$DEV_PORT/" 2>/dev/null; then
      if [ -z "${SMOKE_FORCE_BUILD:-}" ]; then
        echo "${R}${B}refusing to build:${X} something is listening on :$DEV_PORT (a \`next dev\`?)."
        echo "  Building now would collide with its .next dir. Stop dev first, or set"
        echo "  ${D}SMOKE_FORCE_BUILD=1${X} to override, or ${D}SMOKE_SKIP_BUILD=1${X} to reuse the build."
        exit 1
      fi
      echo "${Y}warning: :$DEV_PORT is in use but SMOKE_FORCE_BUILD=1 - building anyway.${X}"
    fi
    echo "${B}› npm run build${X}"
    if ! npm run build; then
      echo "${R}${B}FAIL: build errored - smoke aborted.${X}"
      exit 1
    fi
    echo ""
  else
    echo "${D}SMOKE_SKIP_BUILD set - reusing existing .next${X}"
    echo ""
  fi

  echo "${B}› starting prod server${X} ${D}(next start -p $PORT - same as \`npm run start\`)${X}"
  npx next start -p "$PORT" >"$SRV_LOG" 2>&1 &
  SRV_PID=$!

  # Wait for readiness by polling HTTP (more robust than parsing logs cross-OS).
  READY=0
  for _ in $(seq 1 60); do
    if ! kill -0 "$SRV_PID" 2>/dev/null; then
      echo "${R}${B}FAIL: prod server exited during boot.${X} last log lines:${X}"
      tail -n 20 "$SRV_LOG" 2>/dev/null | sed 's/^/    /'
      exit 1
    fi
    if curl -sS -o /dev/null -m 3 "$BASE_URL/" 2>/dev/null; then READY=1; break; fi
    sleep 1
  done
  if [ "$READY" != "1" ]; then
    echo "${R}${B}FAIL: prod server did not become ready in 60s.${X} last log lines:${X}"
    tail -n 20 "$SRV_LOG" 2>/dev/null | sed 's/^/    /'
    exit 1
  fi
  echo "${G}server up.${X}"
  echo ""
fi

# ── HTTP helpers ─────────────────────────────────────────────────────────────
G_CODE=""; G_HEADERS=""
do_curl() { # $1 = path → sets G_CODE, G_HEADERS. `-D -` = headers only, like `curl -i` sans body.
  local out
  out="$(curl -sS -m "$TIMEOUT" -D - -o /dev/null -w 'CURLCODE:%{http_code}' "$BASE_URL$1" 2>/dev/null)"
  G_CODE="${out##*CURLCODE:}"
  G_HEADERS="${out%CURLCODE:*}"
  [ -n "$G_CODE" ] || G_CODE="000"        # 000 = connection failed / no response
}

# Classify a 401 into its source by header signature.
classify_401() {
  local h="$G_HEADERS"
  if printf '%s' "$h" | grep -qiE '^www-authenticate:[[:space:]]*basic'; then
    echo "APP basic-auth gate  ${D}(WWW-Authenticate: Basic)${X}"; return
  fi
  if printf '%s' "$h" | grep -qiE '_vercel_sso_nonce|/sso-api|x-vercel-sso'; then
    echo "Vercel SSO / deployment protection  ${D}(_vercel_sso_nonce)${X}"; return
  fi
  if printf '%s' "$h" | grep -qiE '^server:[[:space:]]*Vercel'; then
    echo "Vercel SSO / deployment protection  ${D}(server: Vercel, no Basic challenge)${X}"; return
  fi
  echo "app UNAUTHORIZED  ${D}(errors.ts code=UNAUTHORIZED - not an edge gate)${X}"
}

header_val() { # $1 = header name (case-insensitive) → echoes value of first match
  printf '%s' "$G_HEADERS" | grep -iE "^$1:" | head -1 | sed -E "s/^[^:]*:[[:space:]]*//; s/[[:space:]]*\$//"
}

PASS=0; FAIL=0
row() { printf '   %-16s %s\n' "$1" "$2"; }

check() { # $1 path, $2 kind(status|redirect), $3 arg, $4 desc
  local path="$1" kind="$2" arg="$3" desc="$4"
  do_curl "$path"

  # Any 401 is classified and reported, whatever the expectation was.
  if [ "$G_CODE" = "401" ]; then
    row "$path" "${R}FAIL${X} 401 → $(classify_401)  ${D}$desc${X}"
    FAIL=$((FAIL+1)); return
  fi
  if [ "$G_CODE" = "000" ]; then
    row "$path" "${R}FAIL${X} no response (connection failed)  ${D}$desc${X}"
    FAIL=$((FAIL+1)); return
  fi

  case "$kind" in
    status)
      if [ "$G_CODE" = "$arg" ]; then
        row "$path" "${G}PASS${X} $G_CODE  ${D}$desc${X}"; PASS=$((PASS+1))
      else
        row "$path" "${R}FAIL${X} $G_CODE ${D}(want $arg)${X}  ${D}$desc${X}"; FAIL=$((FAIL+1))
      fi
      ;;
    redirect)
      local loc; loc="$(header_val location)"
      if printf '%s' "$G_CODE" | grep -qE '^3..$' && printf '%s' "$loc" | grep -qF "$arg"; then
        row "$path" "${G}PASS${X} $G_CODE → $loc  ${D}$desc${X}"; PASS=$((PASS+1))
      elif [ "$G_CODE" = "200" ]; then
        row "$path" "${R}FAIL${X} 200 not gated ${D}(want 3xx → …$arg…; Supabase env not loaded?)${X}  ${D}$desc${X}"; FAIL=$((FAIL+1))
      else
        row "$path" "${R}FAIL${X} $G_CODE ${D}(want 3xx → …$arg…)${X} loc='${loc}'  ${D}$desc${X}"; FAIL=$((FAIL+1))
      fi
      ;;
  esac
}

# ── Checks ───────────────────────────────────────────────────────────────────
echo "${B}Public routes${X} ${D}(expect 200)${X}"
check "/"            status 200 "marketing home"
check "/pricing"     status 200 "pricing"
check "/sign-in"     status 200 "sign-in"
check "/sign-up"     status 200 "sign-up"
check "/legal/dpa"   status 200 "DPA legal page"

# Representative header assertion on the home route.
do_curl "/"
CT="$(header_val content-type)"
if printf '%s' "$CT" | grep -qiF 'text/html'; then
  row "/ (header)" "${G}PASS${X} content-type: $CT"; PASS=$((PASS+1))
else
  row "/ (header)" "${R}FAIL${X} content-type='${CT}' ${D}(want text/html)${X}"; FAIL=$((FAIL+1))
fi

echo ""
echo "${B}Auth callback${X} ${D}(expect 3xx → /sign-in when no ?code)${X}"
check "/auth/callback" redirect "/sign-in" "PKCE callback, missing code"

echo ""
echo "${B}Gated app routes${X} ${D}(unauthenticated → expect 3xx → /sign-in)${X}"
check "/app"            redirect "/sign-in" "app dashboard"
check "/app/memory"     redirect "/sign-in" "Business Memory"
check "/app/pipeline"   redirect "/sign-in" "Investor Pipeline"
check "/app/pitch"      redirect "/sign-in" "Pitch Lab"
check "/app/live-raise" redirect "/sign-in" "Live Raise"
check "/onboarding"     redirect "/sign-in" "onboarding (session required)"
check "/styleguide"     redirect "/sign-in" "styleguide (session required)"
check "/reactivate"     redirect "/sign-in" "reactivate (session required)"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
TOTAL=$((PASS+FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo "${G}${B}✓ smoke passed${X}  ${G}$PASS/$TOTAL checks${X}"
  echo ""
  exit 0
fi
echo "${R}${B}✗ smoke failed${X}  ${R}$FAIL/$TOTAL checks failed${X} ${D}($PASS passed)${X}"
if [ "$EXTERNAL" = "1" ]; then
  echo "${D}note: remote target - a wall of 401s classified above as Vercel SSO or basic-auth${X}"
  echo "${D}means the deploy is gated, not broken. Lift the gate / add a bypass token to smoke it.${X}"
fi
echo ""
exit 1
