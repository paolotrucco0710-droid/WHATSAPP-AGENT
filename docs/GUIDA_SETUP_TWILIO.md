# Guida setup Flexi con Twilio

Questa guida è pensata per te: lavori solo da browser (GitHub web) e non hai il codice sul PC. Segui i passi **nell’ordine**.

---

## Cosa stai costruendo

```
Barbiere scrive su WhatsApp
        ↓
   Numero Flexi (Twilio)
        ↓
   Twilio invia webhook al server Flexi
        ↓
   Flexi capisce il messaggio (OpenAI)
        ↓
   Flexi risponde al barbiere su WhatsApp
```

**Per il barbiere:** salva il numero Flexi in rubrica e scrive. Niente app, niente login.

**Per te:** configuri Twilio, OpenAI, deploy cloud, e le variabili d’ambiente. Una volta fatto, dai al barbiere solo il **numero WhatsApp di Flexi**.

---

## Checklist rapida

- [ ] Account Twilio con WhatsApp attivo
- [ ] Chiave OpenAI
- [ ] Flexi deployato su cloud (Railway o Render)
- [ ] Variabili d’ambiente impostate
- [ ] Webhook Twilio puntato al server
- [ ] `BARBER_ALLOWLIST` con il numero del barbiere
- [ ] Test: invii `Ciao` e ricevi risposta
- [ ] Dai il numero Flexi al barbiere

---

## PASSO 1 — Account Twilio + numero WhatsApp

### 1.1 Crea account Twilio

1. Vai su [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Registrati e verifica email/telefono
3. Nella **Console Twilio** trovi:
   - **Account SID** (inizia con `AC...`)
   - **Auth Token** (clicca per mostrarlo)

Salvali: ti serviranno dopo.

### 1.2 Attiva WhatsApp su Twilio

Twilio non ti dà subito un numero WhatsApp di produzione. Il percorso tipico:

**Fase sandbox (per iniziare a testare):**

1. Console Twilio → **Messaging** → **Try it out** → **Send a WhatsApp message**
2. Twilio ti mostra un numero sandbox (es. `+1 415 523 8886`) e un codice da inviare (es. `join xxx-yyyy`)
3. Dal **tuo** WhatsApp personale, scrivi quel codice al numero sandbox
4. Ora il tuo numero può scambiare messaggi con il sandbox

**Fase produzione (per il barbiere vero):**

1. Console Twilio → **Messaging** → **Senders** → **WhatsApp senders**
2. Richiedi un numero WhatsApp Business (Twilio guida la verifica con Meta)
3. Una volta approvato, avrai un numero tipo `whatsapp:+39...` o internazionale

> **Nota:** in sandbox solo i numeri che hanno inviato `join ...` possono scrivere. Per il barbiere in produzione serve il numero WhatsApp Business approvato.

### 1.3 Il numero da dare al barbiere

È il **numero WhatsApp di Flexi su Twilio** (`TWILIO_WHATSAPP_FROM`), **non** il numero personale del barbiere.

Esempio sandbox: `+1 415 523 8886`  
Esempio produzione: il numero italiano che ottieni da Twilio.

---

## PASSO 2 — Chiave OpenAI

1. Vai su [platform.openai.com](https://platform.openai.com)
2. **API keys** → **Create new secret key**
3. Copia la chiave (inizia con `sk-...`)
4. Assicurati di avere credito/billing attivo

Senza OpenAI, Flexi usa un parser base che capisce meno frasi vaghe tipo *"metti Luca domani pomeriggio"*.

---

## PASSO 3 — Deploy su cloud (senza scaricare il codice)

Userai un servizio che prende il codice direttamente da GitHub.

### Opzione A: Railway (consigliata, semplice)

1. Vai su [railway.app](https://railway.app) e registrati con GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Scegli il repo `WHATSAPP-AGENT`, branch **`main`**
4. Railway rileva il `Dockerfile` e fa il deploy automatico
5. Vai su **Settings** → **Networking** → **Generate Domain**
6. Otterrai un URL tipo `https://flexi-production-xxxx.up.railway.app`

### Opzione B: Render

1. Vai su [render.com](https://render.com) e collega GitHub
2. **New** → **Web Service** → repo `WHATSAPP-AGENT`
3. **Environment**: Docker
4. Aggiungi un **Disk** montato su `/app/data` (il database SQLite deve persistere)
5. Ottieni URL tipo `https://flexi-xxxx.onrender.com`

### Verifica deploy

Apri nel browser:

```
https://TUO-URL/health
```

Deve rispondere qualcosa tipo:

```json
{
  "status": "ok",
  "service": "flexi",
  "messaging": "twilio",
  "twilio": "configured"
}
```

Se `"messaging": "not_configured"`, mancano le variabili d’ambiente (passo 4).

### Railway: "Application failed to respond"

Se `/health` non risponde:

1. **Redeploy** dall'ultimo `main` su GitHub (include `railway.toml` + fix deploy)
2. **Settings** → **Build** → deve usare **Dockerfile**
3. **Deployments** → ultimo deploy → **View Logs** (cerca `tsx not found`, `Migration failed`)
4. Variabili minime: `NODE_ENV=production`, `DATABASE_URL=/app/data/flexi.db`, `MESSAGING_PROVIDER=twilio`, `TWILIO_*`
5. Aggiungi **Volume** su `/app/data` per il database

Se nei log vedi `Flexi running on http://0.0.0.0:...` ma il browser no → **Networking** → rigenera il domain.

---

## PASSO 4 — Variabili d’ambiente

Nella dashboard Railway/Render, sezione **Variables** / **Environment**, aggiungi:

| Variabile | Valore | Obbligatoria |
|-----------|--------|--------------|
| `MESSAGING_PROVIDER` | `twilio` | Sì |
| `TWILIO_ACCOUNT_SID` | `AC...` dalla console Twilio | Sì |
| `TWILIO_AUTH_TOKEN` | token dalla console Twilio | Sì |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (il tuo numero Flexi) | Sì |
| `OPENAI_API_KEY` | `sk-...` | Consigliata |
| `OPENAI_MODEL` | `gpt-4o-mini` | No (default ok) |
| `NODE_ENV` | `production` | Sì |
| `DATABASE_URL` | `/app/data/flexi.db` | Sì (Railway/Render con volume) |
| `PORT` | **NON impostare** — Railway lo gestisce da solo | No |

### Esempio completo

```
MESSAGING_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
OPENAI_API_KEY=sk-xxxxxxxx
NODE_ENV=production
BARBER_ALLOWLIST=+393331112233
ADMIN_SECRET=la-mia-password-segreta-lunga
DATABASE_URL=/app/data/flexi.db
```

Dopo aver salvato le variabili, il servizio fa **redeploy** automatico. Aspetta 1–2 minuti e ricontrolla `/health`.

### Cosa fa `BARBER_ALLOWLIST`

Solo i numeri in questa lista possono usare Flexi. Utile nel pilot con un solo barbiere: evita che chiunque trovi il numero possa usarlo.

Formato: numeri separati da virgola, con prefisso internazionale.

```
BARBER_ALLOWLIST=+393331112233,+393339998877
```

### Cosa fa `ADMIN_SECRET`

Ti permette di pre-configurare un barbiere **senza** che abbia ancora scritto. Utile per impostare la durata del taglio (default 30 min).

---

## PASSO 5 — Configurare webhook Twilio

Twilio deve sapere dove inviare i messaggi in arrivo.

1. Console Twilio → **Messaging** → **Senders** → seleziona il tuo numero WhatsApp  
   *(oppure, in sandbox: **Messaging** → **Try it out** → **Send a WhatsApp message**)*
2. Trova **"When a message comes in"** / **Webhook**
3. Imposta:
   - **URL:** `https://TUO-URL/twilio/webhook`
   - **Method:** `HTTP POST`
4. Salva

### URL esatto

Se il tuo deploy è `https://flexi-production-xxxx.up.railway.app`, il webhook è:

```
https://flexi-production-xxxx.up.railway.app/twilio/webhook
```

> **Importante:** deve essere `https` (non `http`). Twilio richiede HTTPS.

### Differenza con Meta

Con Twilio **non** serve configurare verify token o GET webhook. Solo POST su `/twilio/webhook`.

---

## PASSO 6 — Pre-configurare il barbiere (opzionale)

Se i tagli durano 45 minuti invece di 30, configura prima del primo messaggio.

Usa un tool online tipo [reqbin.com](https://reqbin.com) o la console del browser:

- **URL:** `POST https://TUO-URL/admin/barber`
- **Header:** `Content-Type: application/json`
- **Header:** `X-Admin-Secret: la-tua-ADMIN_SECRET`
- **Body:**

```json
{
  "phone": "+393331112233",
  "averageTime": 45,
  "name": "Mario"
}
```

Il `phone` è il **numero WhatsApp del barbiere** (da cui scrive), non il numero Flexi.

Se salti questo passo, Flexi crea il barbiere automaticamente al primo messaggio con `average_time` = 30 minuti.

---

## PASSO 7 — Test

### Sandbox Twilio

1. Dal tuo WhatsApp, assicurati di aver inviato `join xxx-yyyy` al numero sandbox
2. Scrivi `Ciao` al numero Flexi
3. Dovresti ricevere:

```
Ciao! Sono Flexi.

Scrivimi ad esempio:
• Marco domani alle 15
• agenda oggi
• Gianni ha annullato
```

4. Prova: `Marco domani alle 15` → Flexi chiede conferma → rispondi `Confermi` o `Sì`

### Produzione con barbiere

1. Aggiungi il suo numero in `BARBER_ALLOWLIST`
2. Fagli salvare il numero Flexi in rubrica
3. Lui scrive `Ciao`
4. Se non risponde, vedi sezione **Problemi comuni** sotto

---

## PASSO 8 — Dare il numero al barbiere

Quando il test funziona, comunica al barbiere:

1. **Il numero da salvare** (quello Flexi su Twilio)
2. **Come usarlo:** scrive in italiano normale, es. `Luca domani alle 15`
3. **Conferma sempre** quando Flexi chiede "Confermi?"
4. **Condividi contatti** come faresti su WhatsApp — Flexi li legge. In alternativa: `Nuovo cliente Nome +39...`

Non serve spiegare comandi, login o app.

---

## Cosa succede al primo messaggio del barbiere

1. Twilio invia il messaggio a `/twilio/webhook`
2. Flexi legge il numero del mittente (`From` / `WaId`)
3. Se è in `BARBER_ALLOWLIST` (o la lista è vuota), procede
4. Crea automaticamente il record barbiere nel database
5. Risponde su WhatsApp

**Non devi creare account manualmente** per il barbiere.

---

## Limitazioni con Twilio (da sapere)

| Funzione | Stato |
|----------|-------|
| Messaggi di testo | ✅ Funziona |
| Conferma appuntamenti | ✅ Funziona |
| Agenda, spostamenti, cancellazioni | ✅ Funziona |
| Promemoria con link wa.me | ✅ Funziona |
| Contatto condiviso WhatsApp | ✅ Funziona — Twilio lo manda come vCard, Flexi lo legge |
| Sandbox Twilio | ⚠️ Solo numeri che hanno fatto `join` |
| Produzione | Serve numero WhatsApp Business approvato su Twilio |

---

## Problemi comuni

### Flexi non risponde

1. Controlla `https://TUO-URL/health` → `messaging` deve essere `"twilio"`
2. Verifica webhook Twilio: URL corretto, metodo POST
3. Guarda i **logs** su Railway/Render (errori Twilio o OpenAI)
4. In sandbox: hai inviato `join ...` da quel numero?

### "Flexi non è ancora attivo per questo numero"

Il numero non è in `BARBER_ALLOWLIST`. Aggiungilo nelle variabili d’ambiente e redeploy.

### Twilio errore 63007 o simili

`TWILIO_WHATSAPP_FROM` sbagliato. Deve essere formato `whatsapp:+...` con il numero esatto della console Twilio.

### OpenAI errore

Chiave mancante, scaduta o senza credito. Flexi funziona ma capisce meno.

### Database si resetta

Su Render/Railway senza volume persistente, ad ogni redeploy perdi dati. Monta disco su `/app/data` e imposta `DATABASE_URL=/app/data/flexi.db`.

### Webhook non arriva

- URL deve essere HTTPS pubblico
- Niente `localhost`
- Controlla su Twilio → **Monitor** → **Logs** → **Errors**

---

## Costi indicativi (ordine di grandezza)

| Servizio | Costo |
|----------|-------|
| Railway/Render | ~5–7 €/mese (piano base) |
| Twilio WhatsApp | ~0,05 € per conversazione + costo messaggi |
| OpenAI gpt-4o-mini | pochi centesimi per molti messaggi |

Per un pilot con un barbiere, budget indicativo: **10–20 €/mese**.

---

## Riepilogo: cosa fa chi

### Tu (una tantum)

1. Account Twilio + numero WhatsApp
2. Chiave OpenAI
3. Deploy da GitHub su Railway/Render
4. Variabili d’ambiente
5. Webhook Twilio → `/twilio/webhook`
6. Test con `Ciao`

### Barbiere (sempre)

1. Salva numero Flexi
2. Scrive in italiano
3. Conferma quando chiesto

---

## Link utili

- Repo GitHub: [github.com/paolotrucco0710-droid/WHATSAPP-AGENT](https://github.com/paolotrucco0710-droid/WHATSAPP-AGENT)
- Twilio Console: [console.twilio.com](https://console.twilio.com)
- Twilio WhatsApp docs: [twilio.com/docs/whatsapp](https://www.twilio.com/docs/whatsapp)
- OpenAI API keys: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Railway: [railway.app](https://railway.app)
- Render: [render.com](https://render.com)

---

*Ultimo aggiornamento: guida per Flexi V1 con provider Twilio (`MESSAGING_PROVIDER=twilio`).*
