# Flexi — Attivazione e go-live con barbiere vero

Checklist per te (founder) prima di dare Flexi a un barbiere.

---

## Sei pronto?

**Sì, per un pilot con un barbiere vero** — il motore è completo.  
**Non ancora** come prodotto commerciale finito (niente dashboard, supporto, multi-barbiere self-service).

Flexi oggi è fatto per validare: *"Un barbiere usa Flexi su WhatsApp ogni giorno?"*

---

## Checklist attivazione (ordine)

### 1. Deploy cloud
- [ ] Railway o Render collegato al repo GitHub `main`
- [ ] Disco persistente su `/app/data` (il database non si resetta)
- [ ] URL pubblico tipo `https://flexi-xxxx.up.railway.app`
- [ ] `GET /health` → `"status": "ok"`, `"twilio": "configured"`

### 2. Variabili d'ambiente
```
MESSAGING_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+...
OPENAI_API_KEY=sk-...
NODE_ENV=production
DATABASE_URL=/app/data/flexi.db
BARBER_ALLOWLIST=+39XXXXXXXXXX
ADMIN_SECRET=password-lunga
BRIEFING_AVERAGE_PRICE=25
```

### 3. Twilio
- [ ] Webhook: `https://TUO-URL/twilio/webhook` (POST)
- [ ] **Produzione:** numero WhatsApp Business approvato (non solo sandbox)
- [ ] Sandbox: barbiere deve inviare `join xxx` al numero test

### 4. Pre-configura il barbiere (opzionale)
```bash
curl -X POST https://TUO-URL/admin/barber \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Secret: password-lunga' \
  -d '{"phone":"+39BARBIERE","averageTime":30,"name":"Mario"}'
```

### 5. Test tuoi (prima del barbiere)
- [ ] `Ciao` → risposta benvenuto
- [ ] `azioni` → `OK` → link wa.me
- [ ] `Marco domani alle 15` → `Confermi` → salvato
- [ ] `agenda` → settimana
- [ ] `agenda oggi` → buchi 🟢

### 6. Consegna al barbiere
- [ ] Salva in rubrica il **numero Flexi** (Twilio)
- [ ] Invia il cheat sheet: `docs/CHEAT_SHEET_BARBIERE.md`
- [ ] Fai fare il test dei 5 messaggi insieme a lui
- [ ] Resta reperibile i primi 2–3 giorni

---

## Cosa dire quando lo "vendi"

**Onesto e forte:**
> "Flexi ti prepara la giornata su WhatsApp: appuntamenti, agenda, e link pronti per richiamare i clienti. Non è un'app — scrivi e basta. Io lo tengo acceso, tu lo provi un mese."

**Non promettere:**
- Invio automatico ai clienti
- Contabilità / guadagni precisi
- App o login
- Che capisce tutto al 100% senza OpenAI

**Prezzo pilot suggerito:** gratis o simbolico (€20–50/mese) finché validi l'ipotesi.

---

## Limiti noti (da sapere)

| Cosa | Stato |
|------|--------|
| Messaggi testo | ✅ |
| Link wa.me pronti | ✅ |
| Piano giornaliero (`azioni`) | ✅ |
| Agenda settimana | ✅ |
| Conferma prima di salvare | ✅ |
| Invio automatico clienti | ❌ volutamente no |
| Contatto condiviso WhatsApp | ✅ Funziona (Twilio invia vCard, Flexi la legge) |
| Più barbieri stesso numero Flexi | ✅ (ogni barbiere identificato dal suo numero) |
| Dashboard / pannello | ❌ |

---

## Se qualcosa non funziona

1. Controlla `/health` sul deploy
2. Log su Railway/Render
3. Twilio Console → Monitor → errori webhook
4. Verifica `BARBER_ALLOWLIST` contiene il numero esatto del barbiere (`+39...`)

Guida setup completa: [GUIDA_SETUP_TWILIO.md](./GUIDA_SETUP_TWILIO.md)
