# Flexi — Product Brief

## Cos'è Flexi

Flexi è una macchina che lavora dietro le quinte per aiutare il barbiere a gestire clienti e appuntamenti direttamente da WhatsApp.

**L'interfaccia è WhatsApp. Punto.**

Flexi NON è: CRM, gestionale, agenda, assistente AI, chatbot.

## Obiettivo V1

Validare un'unica ipotesi:

> "Un barbiere è disposto a gestire gli appuntamenti scrivendo a Flexi su WhatsApp?"

## Esperienza utente

Il barbiere scrive in linguaggio naturale, senza comandi:

- "Luca domani alle 15"
- "Sposto Marco a venerdì"
- "Gianni ha annullato"
- "Nuovo cliente Andrea"
- "Ricordami Luca tra sei settimane"

## Regola fondamentale

**Mai modificare il database senza conferma.**

Flexi risponde sempre con un riepilogo e chiede "Confermi?" prima di agire.

## Identificazione

- **Barbiere**: identificato dal suo numero WhatsApp. Zero login.
- **Cliente**: chiave interna = numero di telefono. Il barbiere usa solo il nome.
- Se esiste un solo cliente con quel nome → procedi.
- Se ce ne sono più di uno → chiedi quale (lista numerata).
- Più clienti possono avere lo stesso nome.

## Onboarding

Praticamente inesistente. Il database cresce nel tempo. Nessun import Excel.

## Invio messaggi (V1)

Link `wa.me` tramite astrazione `sendReminder()`. Non costruire il sistema attorno ai link.

## average_time

Ogni barbiere ha `average_time` (30, 45, 60 min). Nessun tipo di servizio in V1.

## Priorità

1. Linguaggio naturale
2. Affidabilità
3. Conferma delle azioni
4. Esperienza velocissima
5. Codice semplice

## Fuori scope V1

Dashboard, analytics, AI generica, profili cliente complessi, automazione invio messaggi, riempimento buchi intelligente, tipi di servizio.
