#!/bin/bash
set -e
cd /workspace
pkill -f "tsx src/index" 2>/dev/null || true
sleep 1
rm -f data/flexi.db*
npm run db:migrate -q
PORT=3001 npx tsx src/index.ts &
sleep 3

B="+393331112233"
BASE="http://localhost:3001"

curl -s -X POST $BASE/dev/seed -H 'Content-Type: application/json' \
  -d '{"barberPhone":"+393331112233","clients":[{"name":"Marco Rossi","phone":"+393331234567"}]}'

msg() {
  echo ">>> $1"
  curl -s -X POST $BASE/dev/message -H 'Content-Type: application/json' \
    -d "{\"barberPhone\":\"$B\",\"text\":\"$1\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('replies',[]):
    print(r['text'].replace(chr(10),' | '))
"
  echo ""
}

echo "=== DUPLICATO APPUNTAMENTO ==="
msg "Marco domani alle 11"
msg "confermo"
msg "Marco domani alle 11"
msg "confermo"

echo "=== CLIENTE DUPLICATO ==="
msg "Nuovo cliente Marco +393331234567"

echo "=== HEALTH ==="
curl -s $BASE/health | python3 -m json.tool

pkill -f "tsx src/index" 2>/dev/null || true
