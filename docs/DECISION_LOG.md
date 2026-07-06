# Flexi — Decision Log

| Data | Decisione | Motivazione |
|------|-----------|-------------|
| 2026-07-01 | Interfaccia unica = WhatsApp | Il barbiere non impara nuovo software |
| 2026-07-01 | Numero barbiere = account | Zero login, zero onboarding |
| 2026-07-01 | Phone cliente = chiave interna, nome = alias | Il barbiere non scrive mai numeri |
| 2026-07-01 | Più clienti possono avere lo stesso nome | Riflette la realtà del salone |
| 2026-07-01 | Conferma obbligatoria prima di ogni modifica DB | Protegge da errori LLM |
| 2026-07-06 | Piano giornaliero con link wa.me (no invio automatico) | Valore economico per barbiere senza violare V1 |
| 2026-07-01 | wa.me in V1, astrazione `sendReminder()` | Veloce da validare, automatizzabile in V2 |
| 2026-07-01 | SQLite per dev, schema multi-tenant | Zero infra, pronto per Postgres |
| 2026-07-01 | TypeScript + Hono + Drizzle | Stack minimale e tipizzato |
| 2026-07-01 | Core senza webhook WhatsApp | Parser + conferma + azioni + simulatore `/dev/message` |
| 2026-07-01 | `agenda oggi` e `Marco fatto` in V1 | Lettura agenda e completamento utili alla validazione |
| 2026-07-01 | Guadagni e invio bulk fuori scope | Risposta onesta senza analytics/automazioni (PRODUCT_BRIEF) |
| 2026-07-01 | Anti-duplicati appuntamenti e clienti | Trust: stesso slot / stesso telefono → blocco + messaggio chiaro |
| 2026-07-01 | OpenAI default + validation layer | Parsing più robusto, date/ore validate |
| 2026-07-01 | Adapter WhatsApp pronto | Webhook + sender; attivo solo con WHATSAPP_* in .env |
| 2026-07-01 | GET /dev/db + test automatici | Tool dev senza PC locale |
| 2026-07-01 | Ricerca clienti esatta → parziale | Meno disambiguazioni inutili |
| 2026-07-01 | Timeout conversazione 30 min | Reset se barbiere si distrae |
| 2026-07-01 | Richiamo dopo "fatto" | Suggerimento 5 settimane, non analytics |
| 2026-07-01 | Contatto condiviso WhatsApp | Inbound contact + POST /dev/contact |
