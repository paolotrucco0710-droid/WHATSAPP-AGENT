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

## Roadmap

1. ✅ Fondamenta: schema DB + struttura progetto
2. ⬜ Webhook WhatsApp
3. ⬜ Parser LLM (linguaggio naturale → azioni)
4. ⬜ Flusso conferma
5. ⬜ Esecuzione azioni
6. ⬜ Link wa.me per promemoria
