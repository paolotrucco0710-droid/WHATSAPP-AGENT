#!/bin/bash
# Comprehensive Flexi message test suite

BASE="http://localhost:3001"
BARBER="+393331112233"

send() {
  local text="$1"
  local label="$2"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "TEST: $label"
  echo "INPUT: $text"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  curl -s -X POST "$BASE/dev/message" \
    -H 'Content-Type: application/json' \
    -d "{\"barberPhone\":\"$BARBER\",\"text\":$(echo "$text" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    | python3 -m json.tool 2>/dev/null || echo "(errore)"
}

echo "=== SEED ==="
curl -s -X POST "$BASE/dev/seed" \
  -H 'Content-Type: application/json' \
  -d '{
    "barberPhone":"+393331112233",
    "averageTime":30,
    "clients":[
      {"name":"Marco Rossi","phone":"+393331234567"},
      {"name":"Luca Rossi","phone":"+393331234001"},
      {"name":"Luca Verdi","phone":"+393331234002"},
      {"name":"Luca Bianchi","phone":"+393331234003"},
      {"name":"Gianni Verdi","phone":"+393335556666"},
      {"name":"Andrea","phone":"+393337778888"}
    ]
  }' | python3 -m json.tool

# --- CREAZIONE APPUNTAMENTI ---
send "Marco domani alle 11:30" "Appuntamento semplice"
send "confermo" "Conferma appuntamento Marco"

send "Luca domani alle 15" "Appuntamento - nome ambiguo (3 Luca)"
send "2" "Selezione Luca Verdi"
send "sì" "Conferma appuntamento Luca Verdi"

send "Domani alle 16 Andrea" "Ordine invertito (data prima del nome)"
send "ok" "Conferma Andrea"

send "Andrea venerdì alle 17" "Secondo appuntamento stesso cliente"
send "no" "Rifiuto conferma"

# --- SPOSTAMENTO ---
send "Sposto Marco a venerdì alle 10" "Spostamento appuntamento"
send "confermo" "Conferma spostamento"

# --- CANCELLAZIONE ---
send "Gianni ha annullato" "Cancellazione"
send "sì" "Conferma cancellazione"

send "Marco non viene più" "Cancellazione variante"
send "confermo" "Conferma cancellazione Marco"

# --- NUOVO CLIENTE ---
send "Nuovo cliente Simone +393339991111" "Nuovo cliente con telefono"
send "ok" "Conferma nuovo cliente"

send "Nuovo cliente Davide" "Nuovo cliente SENZA telefono"
send "Nuovo cliente Davide +393339992222" "Nuovo cliente con telefono (retry)"

# --- PROMEMORIA ---
send "Ricordami Andrea tra 6 settimane" "Promemoria"
send "confermo" "Conferma promemoria"

# --- CLIENTE INESISTENTE ---
send "Pippo domani alle 14" "Cliente non in rubrica"

# --- MESSAGGI NON CAPITI ---
send "ciao come stai" "Conversazione generica"
send "agenda oggi" "Agenda (non implementata)"
send "Marco fatto" "Segna completato (non implementato)"
send "quanto ho guadagnato oggi" "Metriche soldi (non implementata)"

# --- CONFERMA AMBIGUA ---
send "Marco lunedì alle 9" "Nuovo appuntamento per test conferma ambigua"
send "forse" "Risposta non valida durante conferma"
send "annulla" "Annulla durante conferma"

# --- FLUSSO COMPLETO NUOVO CLIENTE + APPUNTAMENTO ---
send "Simone dopodomani alle 18" "Appuntamento per cliente appena creato"
send "confermo" "Conferma"

echo ""
echo "=== DATABASE FINALE ==="
