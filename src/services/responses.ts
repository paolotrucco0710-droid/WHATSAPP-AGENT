import type { FlexiAction } from "../types/actions.js";

/** Risposte immediate senza toccare il database (saluti, fuori scope, unknown). */
export function getInstantResponse(action: FlexiAction): string | null {
  switch (action.type) {
    case "greeting":
      return [
        "Ciao! Sono Flexi.",
        "",
        "Scrivimi ad esempio:",
        "• Marco domani alle 15",
        "• agenda oggi",
        "• Gianni ha annullato",
      ].join("\n");
    case "out_of_scope":
      if (action.topic === "earnings") {
        return [
          "Non tengo ancora i conti dei guadagni.",
          "",
          "Posso aiutarti con:",
          "• agenda oggi",
          "• appuntamenti",
          "• promemoria ai clienti",
        ].join("\n");
      }
      return [
        "Non ho messaggi pronti da mandare in automatico.",
        "",
        "Dimmi un cliente e preparo un promemoria,",
        "oppure scrivi agenda oggi.",
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
