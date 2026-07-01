/**
 * Test 30 frasi reali che un barbiere potrebbe scrivere.
 * Esegui: npm run test:phrases
 */
import { parseNaturalLanguage, parseWithRules } from "../src/llm/parser.js";

const PHRASES = [
  "Luca domani alle 15",
  "Luca domani alle tre",
  "Marco venerdì alle 11:30",
  "Domani alle 16 Andrea",
  "Sposta Marco a lunedì",
  "Sposta Luca a venerdì alle 10",
  "Gianni ha annullato",
  "Marco non viene più",
  "Marco fatto",
  "agenda oggi",
  "agenda domani",
  "Nuovo cliente Simone +393339991111",
  "Ricordami Luca tra 6 settimane",
  "Metti luca alle 5",
  "Metti Andrea quando puoi",
  "ciao come stai",
  "quanto ho guadagnato oggi",
  "OK manda tutto",
  "Pippo domani alle 14",
  "Luca domani alle 15:30",
  "Domani sono pieno sposta tutto",
  "confermo", // risposta contesto — il parser non la gestisce
  "annulla", // risposta contesto
  "forse", // risposta contesto
  "Marco dopodomani alle 9",
  "Segna Andrea per sabato alle 18",
  "Cancella appuntamento di Gianni",
  "Mostrami l'agenda",
  "Buongiorno",
  "Luca ha spostato a martedì alle 17",
];

async function main() {
  const useOpenAI = Boolean(process.env.OPENAI_API_KEY);
  console.log(`Parser: ${useOpenAI ? "OpenAI + validation" : "rules + validation"}\n`);

  let ok = 0;
  let unknown = 0;

  for (const phrase of PHRASES) {
    const action = useOpenAI
      ? await parseNaturalLanguage(phrase)
      : (await import("../src/services/validation.js")).validateAndNormalizeAction(
          parseWithRules(phrase),
        );
    const status = action.type === "unknown" ? "❌" : "✅";
    if (action.type === "unknown") unknown++;
    else ok++;
    console.log(`${status} "${phrase}"`);
    console.log(`   → ${action.type}${action.type === "unknown" && "reason" in action ? ` (${action.reason})` : ""}`);
  }

  console.log(`\n--- Risultato ---`);
  console.log(`Capite: ${ok}/${PHRASES.length}`);
  console.log(`Non capite: ${unknown}/${PHRASES.length}`);
}

main().catch(console.error);
