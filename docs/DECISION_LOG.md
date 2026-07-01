# Flexi — Decision Log

| Data | Decisione | Motivazione |
|------|-----------|-------------|
| 2026-07-01 | Interfaccia unica = WhatsApp | Il barbiere non impara nuovo software |
| 2026-07-01 | Numero barbiere = account | Zero login, zero onboarding |
| 2026-07-01 | Phone cliente = chiave interna, nome = alias | Il barbiere non scrive mai numeri |
| 2026-07-01 | Più clienti possono avere lo stesso nome | Riflette la realtà del salone |
| 2026-07-01 | Conferma obbligatoria prima di ogni modifica DB | Protegge da errori LLM |
| 2026-07-01 | `average_time` invece di tipi servizio | Semplificazione V1 |
| 2026-07-01 | wa.me in V1, astrazione `sendReminder()` | Veloce da validare, automatizzabile in V2 |
| 2026-07-01 | SQLite per dev, schema multi-tenant | Zero infra, pronto per Postgres |
| 2026-07-01 | TypeScript + Hono + Drizzle | Stack minimale e tipizzato |
| 2026-07-01 | Core senza webhook WhatsApp | Simulatore dev finché Meta non è configurato |
| 2026-07-01 | Core pipeline senza webhook | Parser + conferma + azioni + simulatore `/dev/message` |
