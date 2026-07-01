#!/bin/bash
set -e
cd /workspace
pkill -f "tsx src/index" 2>/dev/null || true
sleep 1
rm -f data/flexi.db data/flexi.db-wal data/flexi.db-shm
npm run db:migrate

PORT=3001 npx tsx src/index.ts &
SERVER_PID=$!
sleep 3

BASE="http://localhost:3001"
B="+393331112233"

msg() {
  echo ""
  echo "▶ INPUT: $1"
  curl -s -X POST "$BASE/dev/message" -H 'Content-Type: application/json' \
    -d "{\"barberPhone\":\"$B\",\"text\":\"$1\"}" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d.get('replies',[]):
    print('◀ OUTPUT:', r['text'].replace(chr(10),' | '))
    if r.get('waMeLink'): print('  LINK:', r['waMeLink'][:80]+'...')
"
}

echo "========== SEED =========="
curl -s -X POST "$BASE/dev/seed" -H 'Content-Type: application/json' \
  -d '{"barberPhone":"+393331112233","averageTime":30,"clients":[
    {"name":"Marco Rossi","phone":"+393331234567"},
    {"name":"Luca Rossi","phone":"+393331234001"},
    {"name":"Luca Verdi","phone":"+393331234002"},
    {"name":"Luca Bianchi","phone":"+393331234003"},
    {"name":"Gianni Verdi","phone":"+393335556666"},
    {"name":"Andrea","phone":"+393337778888"}
  ]}' | python3 -m json.tool

echo ""
echo "========== 1. APPUNTAMENTI =========="
msg "Marco domani alle 11:30"
msg "confermo"
msg "Luca domani alle 15"
msg "3"
msg "sì"
msg "Domani alle 16 Andrea"
msg "ok"
msg "Andrea venerdì alle 17"
msg "no"

echo ""
echo "========== 2. SPOSTAMENTO =========="
msg "Sposto Marco a lunedì alle 14"
msg "confermo"

echo ""
echo "========== 3. CANCELLAZIONE =========="
# prima creiamo appuntamento per Gianni
msg "Gianni domani alle 9"
msg "sì"
msg "Gianni ha annullato"
msg "confermo"
msg "Marco non viene più"
msg "sì"

echo ""
echo "========== 4. NUOVO CLIENTE =========="
msg "Nuovo cliente Simone +393339991111"
msg "ok"
msg "Nuovo cliente Davide"
msg "Nuovo cliente Davide +393339992222"
msg "confermo"

echo ""
echo "========== 5. PROMEMORIA =========="
msg "Ricordami Andrea tra 6 settimane"
msg "confermo"

echo ""
echo "========== 6. NON IMPLEMENTATI =========="
msg "agenda oggi"
msg "Marco fatto"
msg "ciao come stai"
msg "quanto ho guadagnato oggi"
msg "OK manda tutto"

echo ""
echo "========== 7. EDGE CASES =========="
msg "Pippo domani alle 14"
msg "forse"
msg "Metti luca alle 5"
msg "annulla"

echo ""
echo "========== DATABASE FINALE =========="
kill $SERVER_PID 2>/dev/null || true
sleep 1

node --input-type=module -e "
import Database from 'better-sqlite3';
const db = new Database('./data/flexi.db');
console.log('Barbieri:', db.prepare('SELECT id,phone,average_time FROM barbers').all());
console.log('Clienti:', db.prepare('SELECT id,name,phone FROM clients').all());
console.log('Appuntamenti:', db.prepare('SELECT c.name,a.starts_at,a.status FROM appointments a JOIN clients c ON c.id=a.client_id ORDER BY a.starts_at').all());
"
