# Flexi — Engineering Constitution

Documento vincolante per ogni modifica al codice.

## Principi

1. **Minimo indispensabile** — Se esiste una soluzione da 50 righe, non scriverne 300.
2. **Modularità** — Componenti piccoli, funzioni riutilizzabili, astrazioni al posto giusto.
3. **Multi-tenant da subito** — Ogni entità ha `barber_id`.
4. **Mai DB senza conferma** — Nessuna scrittura distruttiva senza stato `awaiting_confirmation` risolto.
5. **LLM solo per parsing** — Non inventa, non conversa, non prende iniziative. Trasforma NL → azione strutturata.
6. **WhatsApp è un adapter** — La logica core non dipende da WhatsApp. Ingresso/uscita messaggi via astrazione.
7. **Niente dashboard** — Nessuna UI web per il barbiere in V1.

## Architettura

```
Messaggio in → identify barber → conversation state → parse (LLM) → resolve client → confirm → execute → Messaggio out
```

## Struttura cartelle

- `src/core/` — orchestrazione (processor)
- `src/services/` — logica dominio (barber, clients, appointments, actions)
- `src/llm/` — parsing linguaggio naturale
- `src/messaging/` — astrazione invio/ricezione messaggi
- `src/routes/` — endpoint HTTP (webhook, dev simulator)
- `src/db/` — schema e accesso dati

## LLM

- Output validato con Zod (`FlexiAction`)
- Se parsing fallisce → chiedi chiarimento, non indovinare
- Tono risposte: come una persona, mai "Sto analizzando..."

## Test senza WhatsApp

Endpoint `/dev/message` per simulare messaggi. Obbligatorio finché il webhook non è configurato.

## Cosa non fare

- Over-engineering, pattern sofisticati inutili
- Feature fuori dal PRODUCT_BRIEF
- Hardcodare wa.me nel business logic (usa `sendReminder()`)
