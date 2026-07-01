/**
 * Test frasi barbiere da data/barber-phrases.json
 * Esegui: npm run test:phrases
 */
import { readFileSync } from "node:fs";
import { parseNaturalLanguage, parseWithRules } from "../src/llm/parser.js";
import { validateAndNormalizeAction } from "../src/services/validation.js";

interface PhraseEntry {
  text: string;
  expected: string;
}

const phrases: PhraseEntry[] = JSON.parse(
  readFileSync(new URL("../data/barber-phrases.json", import.meta.url), "utf-8"),
);

async function main() {
  const useOpenAI = Boolean(process.env.OPENAI_API_KEY);
  console.log(
    `Parser: ${useOpenAI ? "OpenAI + validation" : "rules + validation"}\n`,
  );

  let pass = 0;
  let fail = 0;

  for (const { text, expected } of phrases) {
    const action = useOpenAI
      ? await parseNaturalLanguage(text)
      : validateAndNormalizeAction(parseWithRules(text));

    const ok = action.type === expected;
    if (ok) pass++;
    else fail++;

    console.log(`${ok ? "✅" : "❌"} "${text}"`);
    console.log(`   atteso: ${expected} → ottenuto: ${action.type}`);
  }

  console.log(`\n--- Risultato ---`);
  console.log(`OK: ${pass}/${phrases.length}`);
  console.log(`Fail: ${fail}/${phrases.length}`);

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
