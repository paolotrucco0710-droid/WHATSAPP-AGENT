# Flexi

Macchina dietro le quinte per aiutare i barbieri a gestire clienti e appuntamenti da WhatsApp.

## V1 — Obiettivo

Validare: *"Un barbiere è disposto a gestire gli appuntamenti scrivendo a Flexi su WhatsApp?"*

## Setup

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

## Schema database

| Tabella | Scopo |
|---------|-------|
| `barbers` | Account identificato dal numero WhatsApp |
| `clients` | Clienti del barbiere (phone interno, nome visibile) |
| `appointments` | Appuntamenti |
| `conversation_states` | Stato conversazione (conferma, disambiguazione) |

Ogni entità appartiene a un barbiere (`barber_id`).

## Simulatore dev (senza WhatsApp)

```bash
# Seed barbiere + clienti di test
curl -s -X POST http://localhost:3000/dev/seed \
  -H 'Content-Type: application/json' \
  -d '{"barberPhone":"+393331112233","averageTime":30,"clients":[{"name":"Luca Rossi","phone":"+393331234567"},{"name":"Luca Verdi","phone":"+393339876543"},{"name":"Marco","phone":"+393335551111"}]}'

# Simula messaggio barbiere
curl -s -X POST http://localhost:3000/dev/message \
  -H 'Content-Type: application/json' \
  -d '{"barberPhone":"+393331112233","text":"Luca domani alle 15"}'
```

Senza `OPENAI_API_KEY` usa un parser rule-based. Con la key usa OpenAI.

## Roadmap

1. ✅ Fondamenta: schema DB + struttura progetto
2. ✅ Core: parser, conferma, esecuzione azioni, wa.me
3. ✅ Simulatore dev
4. ⬜ Webhook WhatsApp Cloud API
