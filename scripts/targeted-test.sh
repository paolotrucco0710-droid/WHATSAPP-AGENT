#!/bin/bash
set -e
cd /workspace
pkill -f "tsx src/index" 2>/dev/null || true
sleep 1
rm -f data/flexi.db*
npm run db:migrate -q
PORT=3001 npx tsx src/index.ts &
sleep 3

BASE="http://localhost:3001"
B="+393331112233"

msg() {
  echo ""
  echo "▶ $1"
  curl -s -X POST "$BASE/dev/message" -H 'Content-Type: application/json' \
    -d "{\"barberPhone\":\"$B\",\"text\":\"$1\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('replies',[]):
    print('◀', r['text'].replace(chr(10),' | '))
"
}

curl -s -X POST "$BASE/dev/seed" -H 'Content-Type: application/json' \
  -d '{"barberPhone":"+393331112233","clients":[
    {"name":"Marco Rossi","phone":"+393331234567"},
    {"name":"Luca Rossi","phone":"+393331234001"},
    {"name":"Luca Verdi","phone":"+393331234002"},
    {"name":"Luca Bianchi","phone":"+393331234003"}
  ]}' > /dev/null

# Setup: appuntamento Marco oggi per test "fatto"
msg "Marco oggi alle 11"
msg "confermo"

echo ""
echo "========== MESSAGGI RICHIESTI =========="
msg "agenda oggi"
msg "Marco fatto"
msg "confermo"
msg "ciao come stai"
msg "quanto ho guadagnato oggi"
msg "OK manda tutto"
msg "Pippo domani alle 14"
msg "forse"
msg "Metti luca alle 5"
msg "annulla"

kill %1 2>/dev/null || pkill -f "tsx src/index" 2>/dev/null || true
