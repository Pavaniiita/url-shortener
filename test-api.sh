#!/bin/bash
# test-api.sh — tests all endpoints against a running server
# Usage: bash test-api.sh

BASE="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; }
section() { echo -e "\n${BLUE}── $1 ──${NC}"; }

section "Health check"
HEALTH=$(curl -s "$BASE/health")
echo "$HEALTH" | grep -q "ok" && pass "GET /health" || fail "GET /health"

section "Shorten a URL"
SHORTEN=$(curl -s -X POST "$BASE/api/shorten" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.example.com/some/very/long/path?query=true"}')
echo "Response: $SHORTEN"
CODE=$(echo "$SHORTEN" | grep -o '"shortCode":"[^"]*"' | cut -d'"' -f4)
echo "$CODE" != "" && pass "POST /api/shorten → code: $CODE" || fail "POST /api/shorten"

section "Redirect"
REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/$CODE")
[ "$REDIRECT" = "200" ] && pass "GET /$CODE redirected (200)" || echo "Redirect status: $REDIRECT (302 expected if not following)"

section "Custom alias"
CUSTOM=$(curl -s -X POST "$BASE/api/shorten" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://google.com","customAlias":"my-test-link"}')
echo "$CUSTOM" | grep -q "my-test-link" && pass "Custom alias created" || fail "Custom alias"

section "Duplicate alias (should 409)"
DUP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/shorten" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://google.com","customAlias":"my-test-link"}')
[ "$DUP" = "409" ] && pass "Duplicate alias → 409 Conflict" || fail "Expected 409, got $DUP"

section "Link expiry"
EXPIRY=$(curl -s -X POST "$BASE/api/shorten" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com","expiresInDays":30}')
echo "$EXPIRY" | grep -q "expiresAt" && pass "Link with expiry created" || fail "Expiry link"

section "Stats"
sleep 0.5
STATS=$(curl -s "$BASE/api/urls/$CODE/stats")
echo "$STATS" | grep -q "totalClicks" && pass "GET /api/urls/$CODE/stats" || fail "Stats endpoint"
echo "Clicks: $(echo $STATS | grep -o '"totalClicks":[0-9]*' | cut -d: -f2)"

section "List all URLs"
LIST=$(curl -s "$BASE/api/urls?limit=5")
echo "$LIST" | grep -q "urls" && pass "GET /api/urls" || fail "List URLs"

section "Invalid URL (should 400)"
INVALID=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/shorten" \
  -H "Content-Type: application/json" \
  -d '{"url":"not-a-url"}')
[ "$INVALID" = "400" ] && pass "Invalid URL → 400" || fail "Expected 400, got $INVALID"

section "404 for unknown code"
NOTFOUND=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/zzz999xxx")
[ "$NOTFOUND" = "404" ] && pass "Unknown code → 404" || fail "Expected 404, got $NOTFOUND"

section "Delete / deactivate"
DEL=$(curl -s -X DELETE "$BASE/api/urls/$CODE")
echo "$DEL" | grep -q "deactivated" && pass "DELETE /api/urls/$CODE" || fail "Delete"

section "Deactivated link (should 410)"
GONE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/$CODE")
[ "$GONE" = "410" ] && pass "Deactivated link → 410 Gone" || fail "Expected 410, got $GONE"

echo -e "\n${BLUE}Done.${NC}"
