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
- cancel_appointment: { type, clientName, date?, time? }
- fill_slot: { type, date?, time? } — riempi buco libero (riempi, riempi buco)
- create_client: { type, clientName, phone? }
- set_reminder: { type, clientName, weeksFromNow }
- view_agenda: { type, date } — date: "settimana", "oggi", "domani", giorno (martedì...) o ISO
- daily_briefing: { type, date } — piano giornaliero con link wa.me (piano oggi, azioni, soldi, guadagni)
- complete_appointment: { type, clientName } — cliente segnato come fatto/completato
- greeting: { type } — saluti (ciao, buongiorno, come stai)
- out_of_scope: { type, topic } — topic "bulk_send" SOLO per inviare tutto in automatico (manda tutto)
- unknown: { type, reason? }`;

/** Parser rule-based per dev senza API key */

function extractTimeFromFragment(fragment: string): string | undefined {
  const rest = fragment.trim();
  const colon = rest.match(/(\d{1,2})[:.](\d{2})/);
  if (colon) return `${colon[1]}:${colon[2]}`;
  const space = rest.match(/\b(\d{1,2})\s+(\d{2})\b/);
  if (space) return `${space[1]}:${space[2]}`;
  const hourOnly = rest.match(/(?:alle?\s*)?(\d{1,2})\b/);
  if (hourOnly) return hourOnly[1];
  return undefined;
}

function extractDateAndTime(rest: string): { date: string; time?: string } {
  const weekdayPattern =
    /(oggi|domani|dopodomani|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|\d{4}-\d{2}-\d{2})/i;
  const dayMatch = rest.match(weekdayPattern);
  const date = dayMatch?.[1] ?? rest.trim();
  const afterDay = dayMatch
    ? rest.slice(rest.indexOf(dayMatch[0]) + dayMatch[0].length)
    : "";
  const time = extractTimeFromFragment(afterDay) ?? extractTimeFromFragment(rest);
  return { date, time };
}

function stripServiceWords(text: string): string {
  return text
    .replace(/\s+(taglio|barba|sfumatura|rasatura)\b/gi, "")
    .trim();
}

export function parseWithRules(text: string): FlexiAction {
  const t = text.trim();
  const lower = t.toLowerCase();

  const weekdayPattern =
    /(oggi|domani|dopodomani|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|\d{4}-\d{2}-\d{2})/i;

  if (/^(ciao|buongiorno|buonasera|salve|hey|ehi)(\s+come\s+stai)?[!.?]*$/i.test(lower)) {
    return { type: "greeting" };
  }

  if (
    /quanto\s+(ho\s+)?(guadagnato|fatto|preso)/i.test(lower) ||
    /soldi|incasso/i.test(lower)
  ) {
    return { type: "daily_briefing", date: "oggi" };
  }

  if (/^azioni(\s+oggi)?$/i.test(lower) || /^piano(\s+oggi)?$/i.test(lower) || /^cosa\s+posso\s+fare/i.test(lower) || /^briefing/i.test(lower)) {
    const dayMatch = lower.match(/(oggi|domani)/);
    return { type: "daily_briefing", date: dayMatch?.[1] ?? "oggi" };
  }

  if (/^riempi(\s+il\s+)?buco/i.test(lower) || /^riempi$/i.test(lower) || /^riempi\s+slot/i.test(lower)) {
    const dayMatch = lower.match(weekdayPattern);
    const timeMatch = lower.match(/alle?\s+(\d{1,2}[:.]?\d{0,2}|\d{1,2}\s+\d{2})/i);
    const time = timeMatch?.[1]
      ? extractTimeFromFragment(timeMatch[1])
      : undefined;
    return {
      type: "fill_slot",
      date: dayMatch?.[1] ?? "oggi",
      time,
    };
  }

  if (/^(ok\s+)?manda\s+tutto$/i.test(lower) || /^invia\s+tutto$/i.test(lower)) {
    return { type: "out_of_scope", topic: "bulk_send" };
  }

  if (
    /^agenda(\s+settimana|\s+questa\s+settimana)?$/i.test(lower) ||
    /^agenda$/i.test(lower)
  ) {
    return { type: "view_agenda", date: "settimana" };
  }

  if (/^agenda\s+/i.test(lower) || /^mostra(mi)?\s+l'?agenda/i.test(lower)) {
    const dayMatch = lower.match(weekdayPattern);
    return {
      type: "view_agenda",
      date: dayMatch?.[1] ?? "settimana",
    };
  }

  if (/^che\s+ho\s+/i.test(lower)) {
    const dayMatch = lower.match(weekdayPattern);
    if (dayMatch) {
      return { type: "view_agenda", date: dayMatch[1]! };
    }
  }

  const doneMatch = t.match(/^(.+?)\s+(?:è\s+)?fatto[!.?]*$/i) ?? t.match(/^fatto\s+(.+?)[!.?]*$/i);
  if (doneMatch?.[1]) {
    return {
      type: "complete_appointment",
      clientName: doneMatch[1].trim(),
    };
  }

  const mettiTimeMatch = t.match(
    /^metti\s+(.+?)\s+alle?\s+(\d{1,2}[:.]?\d{0,2}|\w+(?:\s+e\s+mezza)?)\s*$/i,
  );
  if (mettiTimeMatch?.[1] && mettiTimeMatch[2]) {
    return {
      type: "create_appointment",
      clientName: stripServiceWords(mettiTimeMatch[1].trim()),
      date: "oggi",
      time: mettiTimeMatch[2].trim(),
    };
  }

  const cancelWithDay =
    t.match(
      /^(?:annulla|cancella)(?:\s+l'?appuntamento)?\s+(?:di\s+)?([A-Za-zÀ-ÿ]+)\s+(oggi|domani|dopodomani|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)/i,
    ) ??
    t.match(
      /^(?:annulla|cancella)(?:\s+l'?appuntamento)?\s+(?:di\s+)?([A-Za-zÀ-ÿ]+)\s+alle?\s+(\d{1,2}[:.]?\d{0,2}|\d{1,2}\s+\d{2})/i,
    );
  if (cancelWithDay?.[1] && cancelWithDay[2]) {
    const isDay = weekdayPattern.test(cancelWithDay[2]);
    return {
      type: "cancel_appointment",
      clientName: cancelWithDay[1].trim(),
      date: isDay ? cancelWithDay[2] : undefined,
      time: isDay ? undefined : extractTimeFromFragment(cancelWithDay[2]),
    };
  }

  const cancelMatch =
    t.match(/^annulla(?:\s+l'?appuntamento)?\s+(?:di\s+)?([A-Za-zÀ-ÿ]+)/i) ??
    t.match(/^cancella(?:\s+l'?appuntamento)?\s+(?:di\s+)?([A-Za-zÀ-ÿ]+)/i) ??
    t.match(/(.+?)\s+(?:ha\s+)?(?:annullato|annulla|cancellato|cancella|non\s+viene)/i);
  if (cancelMatch?.[1]) {
    return {
      type: "cancel_appointment",
      clientName: cancelMatch[1].replace(/^(?:che\s+)?/i, "").trim(),
    };
  }

  const spostaTimeOnly = t.match(
    /^spost[oa]\s+(.+?)\s+alle?\s+(\d{1,2}[:.]?\d{0,2}|\d{1,2}\s+\d{2})\s*$/i,
  );
  if (spostaTimeOnly?.[1] && spostaTimeOnly[2]) {
    return {
      type: "reschedule_appointment",
      clientName: spostaTimeOnly[1].trim(),
      date: "oggi",
      time: extractTimeFromFragment(spostaTimeOnly[2]),
    };
  }

  const vieneMatch = t.match(
    /^(.+?)\s+viene\s+(oggi|domani|dopodomani|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)(?:\s+(.*))?$/i,
  );
  if (vieneMatch?.[1] && vieneMatch[2]) {
    const time =
      extractTimeFromFragment(vieneMatch[3] ?? "") ?? "10:00";
    return {
      type: "create_appointment",
      clientName: stripServiceWords(vieneMatch[1].trim()),
      date: vieneMatch[2].trim(),
      time,
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

  const rescheduleMatch =
    t.match(/(?:spost[oa])\s+(.+?)\s+(?:a|alle?)\s+(.+)/i) ??
    t.match(
      /(?:spost[oa])\s+(.+?)\s+(domani|dopodomani|oggi|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|\d{4}-\d{2}-\d{2})\s*(.*)$/i,
    );
  if (rescheduleMatch?.[1] && rescheduleMatch[2]) {
    const clientName = rescheduleMatch[1].trim();
    const rest = rescheduleMatch[3]
      ? `${rescheduleMatch[2]} ${rescheduleMatch[3]}`.trim()
      : rescheduleMatch[2].trim();
    const { date, time } = extractDateAndTime(rest);
    return {
      type: "reschedule_appointment",
      clientName,
      date,
      time,
    };
  }

  const dayAppointmentMatch = t.match(
    /^(.+?)\s+(domani|dopodomani|oggi|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s+(.*)$/i,
  );
  if (dayAppointmentMatch?.[1] && dayAppointmentMatch[2] && dayAppointmentMatch[3]) {
    const time = extractTimeFromFragment(dayAppointmentMatch[3]);
    if (time) {
      return {
        type: "create_appointment",
        clientName: stripServiceWords(dayAppointmentMatch[1].trim()),
        date: dayAppointmentMatch[2].trim(),
        time,
      };
    }
  }

  const appointmentMatch = t.match(
    /(?:appuntamento\s+)?(.+?)\s+(domani|dopodomani|oggi|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|\d{4}-\d{2}-\d{2}).*?(?:alle?\s*)?(\d{1,2}[:.]?\d{0,2}|\w+(?:\s+e\s+mezza)?)/i,
  );
  if (appointmentMatch?.[1] && appointmentMatch[2] && appointmentMatch[3]) {
    return {
      type: "create_appointment",
      clientName: stripServiceWords(appointmentMatch[1].trim()),
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
      clientName: stripServiceWords(altAppointment[3].trim()),
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
