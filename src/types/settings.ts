export type Language = "es" | "en";

export interface AppSettings {
  /** UI language, and the language the AI writes slides and replies in. */
  language: Language;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "es",
  updatedAt: "",
};

export const LANGUAGES: { value: Language; label: string; nativeLabel: string }[] = [
  { value: "es", label: "Spanish", nativeLabel: "Español" },
  { value: "en", label: "English", nativeLabel: "English" },
];

/** Instruction injected into the agent's system prompt. */
export const LANGUAGE_INSTRUCTION: Record<Language, string> = {
  es: `**Escribí SIEMPRE en español** (español neutro de Latinoamérica). Sin excepciones.
- TODO el texto de las slides va en español: títulos, cuerpo, CTAs, kickers.
- TODO lo que decís en el chat va en español, desde la primera palabra: avisos,
  preguntas, "voy a mirar las referencias", resúmenes y errores.
- El caption y los hashtags van en español.
- No mezcles inglés salvo términos técnicos que no se traducen (ej: "prompt", "deploy").
- Cuidá tildes y signos de apertura (¿ ¡) — se ven en la imagen final.`,
  en: `English.
- All slide copy is in English: headlines, body, CTAs, kickers.
- Your chat replies are in English too.
- Caption and hashtags in English.`,
};
