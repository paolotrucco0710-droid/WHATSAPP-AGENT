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

Senza `OPENAI_API_KEY` usa un parser rule-based (meno preciso). Con la key usa OpenAI + validation layer.

```bash
npm run test:phrases   # test 22 frasi barbiere (data/barber-phrases.json)
npm run test           # test automatici (anti-duplicati, agenda, ecc.)
```

Apri nel browser: `http://localhost:3000/dev/db` per vedere il database in JSON.

Simula contatto condiviso:
```bash
curl -X POST http://localhost:3000/dev/contact \
  -H 'Content-Type: application/json' \
  -d '{"barberPhone":"+393331112233","name":"Andrea","phone":"+393337778888"}'
```

Metti `OPENAI_API_KEY` nel file `.env` per parsing migliore su frasi vaghe.

## WhatsApp Cloud API

L'adapter è pronto. Copia `.env.example` → `.env` e compila:

```
OPENAI_API_KEY=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...
BARBER_ALLOWLIST=+393331112233
ADMIN_SECRET=una-password-lunga
```

Webhook URL per Meta: `https://tuo-dominio/whatsapp/webhook`

Senza queste variabili Flexi funziona solo col simulatore `/dev`.

### Cosa fa il barbiere

1. Salva in rubrica il **numero WhatsApp di Flexi** (quello che ottieni da Meta — non il suo numero personale).
2. Scrive un messaggio, ad esempio `Ciao` o `Marco domani alle 15`.
3. Fine. Nessun login, nessuna app, nessuna registrazione.

Flexi riconosce il barbiere dal **numero da cui scrive** e crea l'account automaticamente al primo messaggio.

### Cosa fai tu (una tantum)

1. **Deploy** del server con HTTPS (vedi sotto).
2. **Meta Developer Console** → WhatsApp → Configuration:
   - Callback URL: `https://tuo-dominio/whatsapp/webhook`
   - Verify token: uguale a `WHATSAPP_VERIFY_TOKEN` nel `.env`
   - Iscriviti al campo `messages`
3. Se sei ancora in **modalità test Meta**, aggiungi il numero del barbiere come destinatario di test nell'app Meta (altrimenti non può scrivere/ricevere).
4. (Opzionale) Pre-configura durata taglio e nome barbiere:

```bash
curl -X POST https://tuo-dominio/admin/barber \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Secret: una-password-lunga' \
  -d '{"phone":"+393331112233","averageTime":45,"name":"Mario"}'
```

Se non lo fai, al primo messaggio il barbiere viene creato con `average_time` 30 minuti (default).

### Deploy (Docker)

```bash
docker build -t flexi .
docker run -p 3000:3000 --env-file .env -v flexi-data:/app/data flexi
```

Verifica: `GET https://tuo-dominio/health` → `"messaging": "twilio"` o `"meta"`.

**Guida completa per Twilio (senza PC, solo web):** [docs/GUIDA_SETUP_TWILIO.md](docs/GUIDA_SETUP_TWILIO.md)

## Roadmap

1. ✅ Fondamenta: schema DB + struttura progetto
2. ✅ Core: parser, conferma, esecuzione azioni, wa.me
3. ✅ Simulatore dev + trust (anti-duplicati)
4. ✅ Adapter WhatsApp (attivo con credenziali Meta)
5. ⬜ Deploy + primo barbiere reale
