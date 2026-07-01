import type { FlexiAction } from "../types/actions.js";
import { flexiActionSchema } from "../types/actions.js";
import { validateAndNormalizeAction } from "../services/validation.js";

const SYSTEM_PROMPT = `Sei il parser di Flexi, un assistente per barbieri su WhatsApp.
Il tuo UNICO compito è estrarre l'azione dal messaggio del barbiere.

Regole:
- NON conversare, NON inventare, NON aggiungere testo extra
- Rispondi SOLO con JSON valido
- Se non capisci, usa type "unknown"
- Per le date usa formato ISO YYYY-MM-DD (risolvi "domani", "venerdì" rispetto a oggi)
- Per l'ora usa formato HH:MM (24h)
- Estrai solo il nome del cliente, non il cognome completo se non presente

Azioni possibili:
- create_appointment: { type, clientName, date, time }
- reschedule_appointment: { type, clientName, date, time? }
- cancel_appointment: { type, clientName }
- create_client: { type, clientName, phone? }
- set_reminder: { type, clientName, weeksFromNow }
- view_agenda: { type, date } — date: "oggi", "domani" o ISO
- complete_appointment: { type, clientName } — cliente segnato come fatto/completato
- greeting: { type } — saluti (ciao, buongiorno, come stai)
- out_of_scope: { type, topic } — topic "earnings" per guadagni/soldi, "bulk_send" per inviare tutto in automatico
- unknown: { type, reason? }`;

/** Parser rule-based per dev senza API key */
export function parseWithRules(text: string): FlexiAction {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (/^(ciao|buongiorno|buonasera|salve|hey|ehi)(\s+come\s+stai)?[!.?]*$/i.test(lower)) {
    return { type: "greeting" };
  }

  if (
    /quanto\s+(ho\s+)?(guadagnato|fatto|preso)/i.test(lower) ||
    /soldi|incasso/i.test(lower)
  ) {
    return { type: "out_of_scope", topic: "earnings" };
  }

  if (/^(ok\s+)?manda\s+tutto$/i.test(lower) || /^invia\s+tutto$/i.test(lower)) {
    return { type: "out_of_scope", topic: "bulk_send" };
  }

  if (/^agenda(\s+(oggi|domani))?$/i.test(lower) || /^mostra(mi)?\s+l'?agenda/i.test(lower)) {
    const dayMatch = lower.match(/(oggi|domani)/);
    return { type: "view_agenda", date: dayMatch?.[1] ?? "oggi" };
  }

  const doneMatch = t.match(/^(.+?)\s+(?:è\s+)?fatto[!.?]*$/i) ?? t.match(/^fatto\s+(.+?)[!.?]*$/i);
  if (doneMatch?.[1]) {
    return {
      type: "complete_appointment",
      clientName: doneMatch[1].trim(),
    };
  }

  const mettiTimeMatch = t.match(/^metti\s+(.+?)\s+alle?\s+(\d{1,2}[:.]?\d{0,2}|\w+)\s*$/i);
  if (mettiTimeMatch?.[1] && mettiTimeMatch[2]) {
    return {
      type: "create_appointment",
      clientName: mettiTimeMatch[1].trim(),
      date: "oggi",
      time: mettiTimeMatch[2].trim(),
    };
  }

  const cancelMatch =
    t.match(/cancella(?:\s+l'?appuntamento)?\s+(?:di\s+)?(.+)/i) ??
    t.match(/(.+?)\s+(?:ha\s+)?(?:annullato|annulla|cancellato|cancella|non\s+viene)/i);
  if (cancelMatch?.[1]) {
    return {
      type: "cancel_appointment",
      clientName: cancelMatch[1].replace(/^(?:che\s+)?/i, "").trim(),
    };
  }

  const movedMatch = t.match(
    /(.+?)\s+ha\s+spostato\s+(?:a|alle?)\s+(.+)/i,
  );
  if (movedMatch?.[1] && movedMatch[2]) {
    const rest = movedMatch[2].trim();
    const timeMatch = rest.match(/(\d{1,2}[:.]?\d{0,2})/);
    const datePart = rest.replace(timeMatch?.[0] ?? "", "").trim() || rest;
    return {
      type: "reschedule_appointment",
      clientName: movedMatch[1].trim(),
      date: datePart,
      time: timeMatch?.[1],
    };
  }

  const reminderMatch = t.match(
    /ricordami\s+(.+?)\s+tra\s+(\d+)\s+settiman/i,
  );
  if (reminderMatch?.[1] && reminderMatch[2]) {
    return {
      type: "set_reminder",
      clientName: reminderMatch[1].trim(),
      weeksFromNow: Number(reminderMatch[2]),
    };
  }

  const newClientMatch = t.match(
    /nuovo\s+cliente\s+(.+?)(?:\s+(\+?\d[\d\s]+))?$/i,
  );
  if (newClientMatch?.[1]) {
    return {
      type: "create_client",
      clientName: newClientMatch[1].trim(),
      phone: newClientMatch[2]?.replace(/\s/g, ""),
    };
  }

  const rescheduleMatch = t.match(
    /(?:spost[oa])\s+(.+?)\s+(?:a|alle?)\s+(.+)/i,
  );
  if (rescheduleMatch?.[1] && rescheduleMatch[2]) {
    const rest = rescheduleMatch[2].trim();
    const timeMatch = rest.match(/(\d{1,2}[:.]?\d{0,2})/);
    const datePart = rest.replace(timeMatch?.[0] ?? "", "").trim() || rest;
    return {
      type: "reschedule_appointment",
      clientName: rescheduleMatch[1].trim(),
      date: datePart,
      time: timeMatch?.[1],
    };
  }

  const appointmentMatch = t.match(
    /(.+?)\s+(domani|dopodomani|oggi|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|\d{4}-\d{2}-\d{2}).*?(?:alle?\s*)?(\d{1,2}[:.]?\d{0,2}|\w+)/i,
  );
  if (appointmentMatch?.[1] && appointmentMatch[2] && appointmentMatch[3]) {
    return {
      type: "create_appointment",
      clientName: appointmentMatch[1].trim(),
      date: appointmentMatch[2].trim(),
      time: appointmentMatch[3].trim(),
    };
  }

  const altAppointment = t.match(
    /(domani|dopodomani|oggi|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica).*?(?:alle?\s*)?(\d{1,2}[:.]?\d{0,2}).*?\b([A-Za-zÀ-ÿ]+)\b/i,
  );
  if (altAppointment?.[1] && altAppointment[2] && altAppointment[3]) {
    return {
      type: "create_appointment",
      clientName: altAppointment[3].trim(),
      date: altAppointment[1].trim(),
      time: altAppointment[2].trim(),
    };
  }

  if (/^forse[!.?]*$/i.test(lower)) {
    return {
      type: "unknown",
      reason: "pending_nothing",
    };
  }

  return { type: "unknown", reason: "Non ho capito il messaggio" };
}

export async function parseNaturalLanguage(text: string): Promise<FlexiAction> {
  const apiKey = process.env.OPENAI_API_KEY;
  let action: FlexiAction;

  if (apiKey) {
    action = await parseWithOpenAI(text, apiKey);
  } else {
    console.warn(
      "[flexi] OPENAI_API_KEY assente — uso parser rule-based (meno preciso)",
    );
    action = parseWithRules(text);
  }

  return validateAndNormalizeAction(action);
}

async function parseWithOpenAI(
  text: string,
  apiKey: string,
): Promise<FlexiAction> {
  const today = new Date().toISOString().split("T")[0];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Oggi è ${today}. Messaggio del barbiere: "${text}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("OpenAI error, falling back to rules:", await response.text());
    return parseWithRules(text);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content;
  if (!content) return parseWithRules(text);

  try {
    const parsed = JSON.parse(content);
    const result = flexiActionSchema.safeParse(parsed);
    if (result.success) return result.data;
    return parseWithRules(text);
  } catch {
    return parseWithRules(text);
  }
}
