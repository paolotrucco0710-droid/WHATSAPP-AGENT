# Attiva un nuovo barbiere — 5 minuti

Dopo aver dato al barbiere il **numero WhatsApp di Flexi**, fai solo questo.

---

## 1. Aggiungi il suo numero su Railway

**Variables** → `BARBER_ALLOWLIST`

Se è il primo barbiere:
```
+393331112233
```

Se ne hai già uno, separa con virgola:
```
+393331112233,+393334445566
```

Salva → redeploy automatico.

---

## 2. Configura il barbiere (nome, tempo, prezzo)

Sostituisci URL, password e numero. Puoi farlo da [hoppscotch.io](https://hoppscotch.io) o da qualsiasi client HTTP.

```http
POST https://TUO-URL.railway.app/admin/barber
x-admin-secret: TUA_ADMIN_SECRET
Content-Type: application/json

{
  "phone": "+393331112233",
  "name": "Marco",
  "averageTime": 30,
  "averagePrice": 20
}
```

| Campo | Cosa significa | Esempio |
|-------|----------------|---------|
| `phone` | WhatsApp del barbiere (con +39) | `+393331112233` |
| `name` | Per "Buongiorno Marco" nel report | `Marco` |
| `averageTime` | Minuti per appuntamento | `30` |
| `averagePrice` | Euro per taglio (stima nel report) | `20` |

Risposta OK → `"barber": { ... }`.

---

## 3. Manda al barbiere

1. **Salva il contatto** Flexi in rubrica WhatsApp
2. Incolla il messaggio da `docs/CHEAT_SHEET_BARBIERE.md`
3. Chiedigli di scrivere **`Ciao`**

Se risponde con il menu → **attivo**.

---

## 4. Test rapido (2 minuti)

Chiedi al barbiere di provare in ordine:

```
Ciao
azioni
OK
Marco domani alle 15
Sì
agenda
```

Se tutto funziona, è pronto.

---

## Sandbox vs produzione

| | Sandbox Twilio | Produzione |
|--|----------------|------------|
| Barbiere | Deve scrivere `join ...` al numero sandbox | Salva solo il contatto Flexi |
| Tu | Webhook già su Railway | Stesso webhook |
| Clienti del barbiere | Solo numeri joinati alla sandbox | Qualsiasi numero |

---

## Checklist una riga

- [ ] `BARBER_ALLOWLIST` aggiornato
- [ ] `POST /admin/barber` con nome, tempo, prezzo
- [ ] Volume `/app/data` montato (altrimenti perdi tutto al redeploy)
- [ ] Cheat sheet inviato
- [ ] Test `Ciao` → OK

---

## Modificare tempo o prezzo dopo

Rimanda lo stesso `POST /admin/barber` con i valori nuovi — aggiorna senza duplicare.
