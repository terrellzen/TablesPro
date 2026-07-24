#!/usr/bin/env bash
set -euo pipefail

API="http://localhost:4000/api"
COOKIE="/tmp/stress-cookies.txt"
DB="psql -U tablespro -d tablespro -t -A"

rm -f "$COOKIE"

api() {
  curl -sS -b "$COOKIE" -c "$COOKIE" -H "Origin: http://localhost:3000" -H "Content-Type: application/json" "$@"
}
jv() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }
now_ms() { python3 -c "import time; print(int(time.time()*1000))"; }

echo "==> Signing in..."
api -X POST "$API/auth/sign-in/email" \
  -d '{"email":"admin@example.com","password":"password"}' > /dev/null
ACTOR=$($DB -c "SELECT user_id FROM app.user_profiles LIMIT 1")
echo "    Actor: $ACTOR"

declare -a WS_NAMES=("Stress-10k" "Stress-100k" "Stress-500k" "Stress-600k")
declare -a ROWS_PER_TABLE=(2500 25000 125000 150000)

for i in 0 1 2 3; do
  ws_name="${WS_NAMES[$i]}"
  rpt="${ROWS_PER_TABLE[$i]}"
  total=$((rpt * 4))

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  $ws_name — $rpt rows × 4 tables = $total total"
  echo "═══════════════════════════════════════════════════════════════"

  ws_id=$(api -X POST "$API/workspaces" -d "{\"name\":\"$ws_name\"}" | jv "['data']['workspace_id']")
  echo "  workspace: $ws_id"

  for bn in 1 2; do
    base_id=$(api -X POST "$API/workspaces/$ws_id/bases" \
      -d "{\"name\":\"Base-$bn\"}" | jv "['data']['base_id']")
    echo "    Base-$bn: $base_id"

    for tn in 1 2; do
      tbl_id=$(api -X POST "$API/bases/$base_id/tables" \
        -d "{\"name\":\"Table-${bn}-${tn}\"}" | jv "['data']['tableId']")

      api -X POST "$API/tables/$tbl_id/fields" -d '{"name":"Name","fieldType":"short_text"}'  > /dev/null
      api -X POST "$API/tables/$tbl_id/fields" -d '{"name":"Score","fieldType":"integer"}'    > /dev/null
      api -X POST "$API/tables/$tbl_id/fields" -d '{"name":"Active","fieldType":"boolean"}'   > /dev/null
      api -X POST "$API/tables/$tbl_id/fields" -d '{"name":"Email","fieldType":"email"}'      > /dev/null

      mapfile -t cols < <($DB -c "SELECT physical_column_name FROM app.fields WHERE table_id='$tbl_id' ORDER BY position")
      phys=$($DB -c "SELECT physical_table_name FROM app.tables WHERE table_id='$tbl_id'")
      full="app_data.\"$phys\""

      tmpfile=$(mktemp)
      python3 -c "
import uuid, random
actor='$ACTOR'
n=$rpt
for j in range(n):
    print(f'{uuid.uuid4()}\t{actor}\t{actor}\tItem {j+1}\t{random.randint(0,10000)}\t{\"t\" if random.random()>0.5 else \"f\"}\tuser{j+1}@stress.local')
" > "$tmpfile"

      echo -n "      Table-${bn}-${tn}: $rpt rows... "
      t0=$(now_ms)

      $DB -c "\\copy $full (record_id,created_by,updated_by,\"${cols[0]}\",\"${cols[1]}\",\"${cols[2]}\",\"${cols[3]}\") FROM '$tmpfile' WITH (FORMAT text)"

      t1=$(now_ms)
      ms=$((t1 - t0))
      rps=0
      [ "$ms" -gt 0 ] && rps=$((rpt * 1000 / ms))
      echo "✓ ${ms}ms (~${rps} rows/s)"
      rm -f "$tmpfile"
    done
  done
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Final verification"
echo "═══════════════════════════════════════════════════════════════"

mapfile -t table_info < <($DB -c "
  SELECT b.name || '|' || t.name || '|' || t.physical_table_name
  FROM app.workspaces w
  JOIN app.bases b ON b.workspace_id = w.workspace_id
  JOIN app.tables t ON t.base_id = b.base_id
  WHERE w.name LIKE 'Stress-%' AND w.deleted_at IS NULL AND b.deleted_at IS NULL AND t.deleted_at IS NULL
  ORDER BY w.name, b.name, t.name
")

grand_total=0
for entry in "${table_info[@]}"; do
  IFS='|' read -r base_name tbl_name phys <<< "$entry"
  cnt=$($DB -c "SELECT count(*) FROM app_data.\"$phys\" WHERE deleted_at IS NULL")
  grand_total=$((grand_total + cnt))
  printf "  %-12s %-14s %'d rows\n" "$base_name" "$tbl_name" "$cnt"
done
echo "  ─────────────────────────────────────────"
printf "  Grand total: %'d rows\n" "$grand_total"
echo ""
echo "Done."
