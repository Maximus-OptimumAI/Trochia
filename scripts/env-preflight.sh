#!/usr/bin/env bash
#
# env-preflight.sh - one-screen "where am I / what am I pointed at" map to run
# BEFORE any database or deploy work.
#
# Prints:
#   1. Runtime (local / preview / prod / eval|ci)
#   2. The Supabase project ref behind DATABASE_URL, DIRECT_URL, SUPABASE_URL,
#      flagged RED when a PROD ref appears outside a prod runtime.
#   3. Presence of TEST_DATABASE_URL + the CI secrets (DATABASE_URL,
#      VOYAGE_API_KEY, ANTHROPIC_API_KEY) where they are needed.
#   4. Reminders for the documented traps (tasks/lessons.md).
#
# SAFE: never prints a connection string, password, or key value. Only the
# public project ref, the host, and SET/MISSING booleans.
#
# Sources of truth for the known refs (tasks/lessons.md + MEMORY.md):
#   PROD  (real Phase 1 project) = xnzyhjwalphcykjwoxdw
#   EVAL  (throwaway/test project) = spqnjvcfmmmdobkwgmxs
#
set -u

# ── Known project refs ───────────────────────────────────────────────────────
PROD_REF="xnzyhjwalphcykjwoxdw"
EVAL_REF="spqnjvcfmmmdobkwgmxs"

# ── Locate repo root (parent of this script's dir) + the env file ────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.local"

# ── Colors (respect NO_COLOR / non-tty) ──────────────────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; X=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; D=''; X=''
fi

# ── Read one KEY from .env.local (no sourcing; last line wins; strip quotes) ──
from_file() {
  local key="$1"
  [ -f "$ENV_FILE" ] || { echo ""; return; }
  local line val
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE" 2>/dev/null | tail -n1)"
  [ -n "$line" ] || { echo ""; return; }
  val="${line#*${key}=}"
  # strip a single pair of surrounding quotes
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  echo "$val"
}

# ── Effective value: process env wins, else .env.local. Reports the source. ──
# Sets globals: EFF_VAL, EFF_SRC
resolve() {
  local key="$1" penv fval
  penv="$(printenv "$key" 2>/dev/null || true)"
  fval="$(from_file "$key")"
  if [ -n "$penv" ]; then
    EFF_VAL="$penv"; EFF_SRC="env"
  elif [ -n "$fval" ]; then
    EFF_VAL="$fval"; EFF_SRC=".env.local"
  else
    EFF_VAL=""; EFF_SRC="unset"
  fi
}

# ── Extract the 20-char Supabase ref from a URL (REST host, pooler userinfo,
#    or direct host). Echoes "" when none found. ──────────────────────────────
extract_ref() {
  local url="$1"
  if [[ "$url" =~ postgres\.([a-z0-9]{20})[:@] ]]; then echo "${BASH_REMATCH[1]}"; return; fi
  if [[ "$url" =~ @db\.([a-z0-9]{20})\.supabase\.co ]]; then echo "${BASH_REMATCH[1]}"; return; fi
  if [[ "$url" =~ https?://([a-z0-9]{20})\.supabase\.co ]]; then echo "${BASH_REMATCH[1]}"; return; fi
  if [[ "$url" =~ ([a-z0-9]{20})\.supabase\.co ]]; then echo "${BASH_REMATCH[1]}"; return; fi
  echo ""
}

# ── Host only (drops scheme, userinfo, path - never leaks the password) ──────
# Strip up to and including the LAST '@' (##*@): a password may itself contain
# an '@', so stripping only the first '@' would leak a password fragment. Host
# names never contain '@', so the segment after the last '@' is always the host.
host_of() {
  local u="$1"
  u="${u#*://}"; u="${u##*@}"; u="${u%%/*}"; u="${u%%\?*}"
  echo "$u"
}

# ── Runtime classification → RUNTIME (one of: prod preview local eval ci) ────
detect_runtime() {
  local ve="${VERCEL_ENV:-}"
  if [ "$ve" = "production" ]; then RUNTIME="prod"; RT_NOTE="VERCEL_ENV=production"
  elif [ "$ve" = "preview" ]; then RUNTIME="preview"; RT_NOTE="VERCEL_ENV=preview"
  elif [ -n "${EVAL_LIVE_REQUIRED:-}" ] || [[ "${GITHUB_WORKFLOW:-}" == *eval* ]]; then
    RUNTIME="eval"; RT_NOTE="eval workflow / EVAL_LIVE_REQUIRED"
  elif [ "${CI:-}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
    RUNTIME="ci"; RT_NOTE="CI/GitHub Actions"
  elif [ "$ve" = "development" ]; then RUNTIME="local"; RT_NOTE="VERCEL_ENV=development"
  else RUNTIME="local"; RT_NOTE="no VERCEL/CI markers"
  fi
}

# ── Classify a ref + decide the row verdict against the runtime ──────────────
# Sets: REF_LABEL, ROW_TAG (colored)
classify_ref() {
  local ref="$1"
  local is_prod="no"; [ "$RUNTIME" = "prod" ] && is_prod="yes"

  if [ -z "$ref" ]; then
    REF_LABEL="${D}unset/unknown${X}"; ROW_TAG="${Y}?  no ref parsed${X}"; return
  fi
  if [ "$ref" = "$PROD_REF" ]; then
    REF_LABEL="${B}PROD${X} ($ref)"
    if [ "$is_prod" = "yes" ]; then ROW_TAG="${G}OK  prod ref in prod${X}"
    else ROW_TAG="${R}${B}DANGER  PROD ref outside prod${X}"; fi
    return
  fi
  if [ "$ref" = "$EVAL_REF" ]; then
    REF_LABEL="EVAL/throwaway ($ref)"
    if [ "$is_prod" = "yes" ]; then ROW_TAG="${R}${B}DANGER  throwaway ref in prod${X}"
    else ROW_TAG="${G}OK  safe (non-prod)${X}"; fi
    return
  fi
  REF_LABEL="other ($ref)"; ROW_TAG="${Y}?  unrecognized ref${X}"
}

# ── Presence check: SET/MISSING for a key (env or .env.local), value hidden ──
present() {
  local key="$1"
  if [ -n "$(printenv "$key" 2>/dev/null || true)" ]; then echo "${G}SET${X} ${D}(env)${X}"; return; fi
  if [ -n "$(from_file "$key")" ]; then echo "${G}SET${X} ${D}(.env.local)${X}"; return; fi
  echo "${R}MISSING${X}"
}

# ══════════════════════════════════════════════════════════════════════════════
detect_runtime

echo ""
echo "${B}═══ env preflight ═══${X}  ${D}(read before any DB or deploy work)${X}"
[ -f "$ENV_FILE" ] || echo "  ${Y}note: $ENV_FILE not found; showing process env only${X}"
echo ""

# 1) Runtime
echo "${B}1) Runtime${X}"
case "$RUNTIME" in
  prod)    echo "   ${R}${B}PROD${X}     ${D}($RT_NOTE)${X}  ${R}live data - every write is real${X}" ;;
  preview) echo "   ${Y}PREVIEW${X}  ${D}($RT_NOTE)${X}" ;;
  eval)    echo "   ${G}EVAL${X}     ${D}($RT_NOTE)${X}" ;;
  ci)      echo "   ${G}CI${X}       ${D}($RT_NOTE)${X}" ;;
  *)       echo "   ${G}LOCAL${X}    ${D}($RT_NOTE)${X}" ;;
esac
echo ""

# 2) Supabase project refs
echo "${B}2) Supabase project ref per var${X}   ${D}PROD=$PROD_REF  EVAL=$EVAL_REF${X}"
DANGER_COUNT=0
for KEY in DATABASE_URL DIRECT_URL SUPABASE_URL; do
  resolve "$KEY"
  if [ -z "$EFF_VAL" ]; then
    printf "   %-14s ${D}%-10s${X} %s\n" "$KEY" "[$EFF_SRC]" "${Y}unset${X}"
    continue
  fi
  ref="$(extract_ref "$EFF_VAL")"
  host="$(host_of "$EFF_VAL")"
  classify_ref "$ref"
  case "$ROW_TAG" in *DANGER*) DANGER_COUNT=$((DANGER_COUNT+1));; esac
  printf "   %-14s ${D}%-10s${X} %-26s %s\n" "$KEY" "[$EFF_SRC]" "$REF_LABEL" "$ROW_TAG"
  printf "   %-14s ${D}%-10s host=%s${X}\n" "" "" "$host"
done
echo ""
# Documented split: locally SUPABASE_URL legitimately carries the PROD ref
resolve "SUPABASE_URL"; SB_REF="$(extract_ref "${EFF_VAL:-}")"
if [ "$RUNTIME" != "prod" ] && [ "$SB_REF" = "$PROD_REF" ]; then
  echo "   ${Y}known split (tasks/lessons.md, MEMORY.md):${X} in .env.local the DB URLs point at the"
  echo "   ${Y}EVAL project but SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL point at PROD. DB I/O over${X}"
  echo "   ${Y}Drizzle/DATABASE_URL is eval-safe, but the Supabase REST/Auth client hits PROD.${X}"
  echo ""
fi

# 3) Presence of TEST_DATABASE_URL + CI secrets
echo "${B}3) Required secrets present here${X}"
printf "   %-20s %s\n" "TEST_DATABASE_URL" "$(present TEST_DATABASE_URL)  ${D}npm run gate / integration tests${X}"
printf "   %-20s %s\n" "DATABASE_URL"      "$(present DATABASE_URL)  ${D}CI must equal TEST_DATABASE_URL (lesson 2026-06-06)${X}"
printf "   %-20s %s\n" "VOYAGE_API_KEY"    "$(present VOYAGE_API_KEY)  ${D}embeddings / eval live${X}"
printf "   %-20s %s\n" "ANTHROPIC_API_KEY" "$(present ANTHROPIC_API_KEY)  ${D}ai/client / eval live${X}"
if [ "$RUNTIME" = "ci" ] || [ "$RUNTIME" = "eval" ]; then
  echo "   ${D}(in CI these come from GitHub Actions secrets; MISSING here = secret not wired)${X}"
else
  echo "   ${D}(local: read from .env.local; CI needs them as GitHub Actions secrets)${X}"
fi
echo ""

# 4) Reminders
echo "${B}4) Reminders${X} ${D}(tasks/lessons.md)${X}"
echo "   ${Y}drizzle-kit does NOT auto-load .env.local${X} - run:"
echo "       ${D}set -a && . ./.env.local && set +a && npx drizzle-kit <cmd>${X}"
echo "   ${Y}use \`drizzle-kit migrate\`, NEVER \`push\`${X} - push diff-syncs and would DROP"
echo "       ${D}the auth_admin_can_read_accounts policy (breaks tenant_id on every login).${X}"
echo "   ${Y}never \`npm run build\` while \`next dev\` is running${X} - the .next dir collides."
echo "   ${Y}before pushing: \`npm run gate\`${X} (sources .env.test, refuses if TEST_DATABASE_URL unset)."
echo ""

# Exit code: non-zero when a PROD ref is exposed outside prod, so this can gate.
if [ "$DANGER_COUNT" -gt 0 ]; then
  echo "${R}${B}⚠ $DANGER_COUNT danger flag(s) above - confirm this is intended before DB/deploy work.${X}"
  echo ""
  exit 2
fi
echo "${G}✓ no prod-ref-outside-prod danger flags.${X}"
echo ""
exit 0
