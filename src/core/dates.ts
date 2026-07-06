const ROME_TZ = "Europe/Rome";

/** Data/ora corrente in Europe/Rome */
export function nowInRome(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: ROME_TZ }),
  );
}

function formatDateRome(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeRome(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);
  return date.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: ROME_TZ,
  });
}

export function formatDisplayDateTime(isoDate: string, time: string): string {
  return `${formatDisplayDate(isoDate)} alle ${time}`;
}

/** Converte "domani", "venerdì", ISO date → YYYY-MM-DD */
export function resolveDate(input: string, reference = nowInRome()): string {
  const lower = input.trim().toLowerCase();

  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    return lower;
  }

  const ref = new Date(reference);

  if (lower === "oggi" || lower === "today") {
    return formatDateRome(ref);
  }

  if (lower === "domani" || lower === "tomorrow") {
    ref.setDate(ref.getDate() + 1);
    return formatDateRome(ref);
  }

  if (lower === "dopodomani") {
    ref.setDate(ref.getDate() + 2);
    return formatDateRome(ref);
  }

  const weekdays: Record<string, number> = {
    domenica: 0,
    lunedi: 1,
    lunedì: 1,
    martedi: 2,
    martedì: 2,
    mercoledi: 3,
    mercoledì: 3,
    giovedi: 4,
    giovedì: 4,
    venerdi: 5,
    venerdì: 5,
    sabato: 6,
  };

  for (const [name, targetDay] of Object.entries(weekdays)) {
    if (lower.includes(name)) {
      const currentDay = ref.getDay();
      let delta = targetDay - currentDay;
      if (delta <= 0) delta += 7;
      ref.setDate(ref.getDate() + delta);
      return formatDateRome(ref);
    }
  }

  return input;
}

/** Converte "15", "15:00", "alle tre" → HH:MM */
export function resolveTime(input: string): string {
  const lower = input.trim().toLowerCase();

  const mezza = lower.match(/(\d{1,2})\s+e\s+mezza/);
  if (mezza?.[1]) {
    return formatTimeRome(Number(mezza[1]), 30);
  }

  const hhmm = lower.match(/(\d{1,2})[:.](\d{2})/);
  if (hhmm) {
    return formatTimeRome(Number(hhmm[1]), Number(hhmm[2]));
  }

  const spaceMinutes = lower.match(/^(\d{1,2})\s+(\d{2})$/);
  if (spaceMinutes) {
    return formatTimeRome(Number(spaceMinutes[1]), Number(spaceMinutes[2]));
  }

  const hourOnly = lower.match(/(?:alle?\s*)?(\d{1,2})\b/);
  if (hourOnly) {
    let h = Number(hourOnly[1]);
    if (h < 8) h += 12; // "alle 3" → 15:00
    return formatTimeRome(h, 0);
  }

  const words: Record<string, number> = {
    una: 13,
    due: 14,
    tre: 15,
    quattro: 16,
    cinque: 17,
    sei: 18,
    sette: 19,
    otto: 20,
    nove: 21,
    dieci: 22,
    undici: 23,
    dodici: 12,
  };

  for (const [word, hour] of Object.entries(words)) {
    if (lower.includes(word)) {
      return formatTimeRome(hour, 0);
    }
  }

  return input;
}

/** Combina data e ora in ISO datetime per il DB */
export function toStartsAt(isoDate: string, time: string): string {
  return `${isoDate}T${time}:00`;
}

export { formatDisplayDate };

const WEEKDAY_NAMES = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
] as const;

/** Solo nome giorno (es. "martedì"), senza numero */
export function formatWeekdayOnly(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString("it-IT", {
    weekday: "long",
    timeZone: ROME_TZ,
  });
}

/** Etichetta agenda: oggi/domani/nome giorno — mai la data numerica */
export function formatAgendaDayLabel(dateInput: string, isoDate?: string): string {
  const lower = dateInput.trim().toLowerCase();

  if (lower === "oggi") return "oggi";
  if (lower === "domani") return "domani";
  if (lower === "dopodomani") return "dopodomani";

  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    return formatWeekdayOnly(lower);
  }

  for (const name of WEEKDAY_NAMES) {
    const normalized = name.normalize("NFD").replace(/\p{M}/gu, "");
    const inputNorm = lower.normalize("NFD").replace(/\p{M}/gu, "");
    if (inputNorm.includes(normalized)) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }

  if (isoDate) {
    return formatWeekdayOnly(isoDate);
  }

  return dateInput;
}

/** Prossimi 7 giorni a partire da oggi (Roma) */
export function getWeekDateRange(reference = nowInRome()): string[] {
  const dates: string[] = [];
  const ref = new Date(reference);
  for (let i = 0; i < 7; i++) {
    dates.push(formatDateRome(ref));
    ref.setDate(ref.getDate() + 1);
  }
  return dates;
}

export function isWeekAgendaDate(dateInput: string): boolean {
  const lower = dateInput.trim().toLowerCase();
  return (
    lower === "settimana" ||
    lower === "questa settimana" ||
    lower === "la settimana"
  );
}
