import type { FlexiAction } from "../types/actions.js";

/** Risposte immediate senza toccare il database (saluti, fuori scope, unknown). */
export function getInstantResponse(action: FlexiAction): string | null {
  switch (action.type) {
    case "greeting":
      return null;
    case "out_of_scope":
      if (action.topic === "earnings") {
        return [
          "Scrivi piano oggi per vedere quanto puoi recuperare.",
          "",
          "Ti preparo i link WhatsApp pronti da inviare.",
        ].join("\n");
      }
      return [
        "Non invio messaggi in automatico.",
        "",
        "Scrivi piano oggi per il riepilogo.",
        "Poi rispondi OK e preparo i link pronti.",
      ].join("\n");
    case "unknown":
      if (action.reason === "pending_nothing") {
        return "Non ho nulla in attesa di conferma. Dimmi cosa vuoi fare.";
      }
      return action.reason ?? "Non ho capito. Puoi ripetere?";
    default:
      return null;
  }
}
