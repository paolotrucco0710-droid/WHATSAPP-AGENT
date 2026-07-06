/** Risposte che confermano un'azione pendente. */
export function isConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(s[iì]|ok|conferm[oa]?|confermi|vai|yes|yep|yeah|certo|esatto)\.?$/i.test(
    t,
  );
}

export function isRejection(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|annulla|annullato|nop|nope)\.?$/i.test(t);
}

export function isAmbiguous(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(forse|boh|non\s+so|vediamo)\.?$/i.test(t);
}

export function isModifyRequest(text: string): boolean {
  return /^modifica$/i.test(text.trim());
}

export const MODIFY_OUT_OF_CONTEXT_MESSAGE = [
  "✏️ MODIFICA funziona solo dopo azioni, quando ci sono messaggi da inviare ai clienti.",
  "",
  "Scrivi prima azioni, poi MODIFICA se vuoi cambiare un messaggio.",
].join("\n");
