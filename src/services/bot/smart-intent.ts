import "server-only";

import { getEmbeddingProvider } from "@/services/embedding";
import { cosineSimilarity } from "@/services/faq/duplicate";
import { normalizeText } from "@/services/rag/normalize";

export type IntentMatchMethod = "EXACT" | "NORMALIZED" | "FUZZY" | "SEMANTIC" | "LLM_FALLBACK";
export type SmartIntent = "GREETING" | "NOISE" | "QUESTION" | "UNKNOWN";

export interface IntentRule {
  type: "GREETING" | "NOISE";
  phrase: string;
  reply: string;
  isActive: boolean;
}

export interface IntentDetection {
  intent: SmartIntent;
  normalizedMessage: string;
  ragQuery: string | null;
  matchedRule: IntentRule | null;
  matchedCanonicalRule: string | null;
  matchMethod: IntentMatchMethod | null;
  greetingWithQuestion: boolean;
}

export interface SmartGreetingOptions {
  enabled: boolean;
  fuzzyEnabled: boolean;
  semanticEnabled: boolean;
  stripGreetingFromQuestion: boolean;
  similarityThreshold: number;
  modifiers: string;
}

const QUESTION_WORDS = new Set([
  "apa", "apakah", "berapa", "kapan", "dimana", "mana", "bagaimana",
  "mengapa", "kenapa", "adakah", "bisakah", "bolehkah", "siapa",
]);
const SHORT_QUESTION_TERMS = new Set([
  "biaya", "syarat", "beasiswa", "daftar", "pendaftaran", "prodi",
  "jurusan", "fakultas", "jadwal", "gelombang", "brosur",
]);
const GREETING_CLOSERS = new Set([
  "wr", "wb", "wrwb", "warahmatullahi", "wabarakatuh", "warohmatullahi",
]);

function canonicalizeIslamicGreeting(value: string): string {
  return value.replace(/^as{1,2}alamu?\s*alaikum\b/, "assalamualaikum");
}

export function normalizeIntentMessage(input: string): string {
  return canonicalizeIslamicGreeting(
    input
      .normalize("NFKC")
      .replace(/[‘’′`]/g, "'")
      .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu, " ")
      .toLowerCase()
      .replace(/['’]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function parseModifiers(value: string): Set<string> {
  return new Set(
    value
      .split(/[,;\n]+/)
      .map((item) => normalizeIntentMessage(item))
      .filter(Boolean),
  );
}

function stripNonMeaningfulTokens(value: string, modifiers: Set<string>): string {
  const tokens = value.split(" ").filter(Boolean);
  while (tokens.length > 0 && (modifiers.has(tokens[0]) || GREETING_CLOSERS.has(tokens[0]))) {
    tokens.shift();
  }
  while (tokens.length > 0 && (modifiers.has(tokens.at(-1)!) || GREETING_CLOSERS.has(tokens.at(-1)!))) {
    tokens.pop();
  }
  return tokens.join(" ");
}

function stripQuestionPreamble(value: string): string {
  return value
    .replace(
      /^(?:(?:saya|aku|kami)\s+)?(?:mau|ingin|hendak)\s+(?:bertanya|tanya)(?:\s+(?:dong|nih))?\s+/,
      "",
    )
    .replace(/^(?:mohon|boleh)\s+(?:bertanya|tanya)\s+/, "")
    .trim();
}

function isMeaningfulQuestion(value: string, original: string): boolean {
  if (!value) return false;
  const tokens = value.split(" ");
  return (
    original.includes("?") ||
    tokens.some((token) => QUESTION_WORDS.has(token) || SHORT_QUESTION_TERMS.has(token)) ||
    tokens.length >= 2
  );
}

function ragQueryFromRemainder(remainder: string, original: string): string {
  const query = remainder.trim();
  return original.trim().endsWith("?") ? `${query}?` : query;
}

function similarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function result(
  intent: SmartIntent,
  normalizedMessage: string,
  patch: Partial<IntentDetection> = {},
): IntentDetection {
  return {
    intent,
    normalizedMessage,
    ragQuery: null,
    matchedRule: null,
    matchedCanonicalRule: null,
    matchMethod: null,
    greetingWithQuestion: false,
    ...patch,
  };
}

export function detectDeterministicIntent(
  originalMessage: string,
  rules: IntentRule[],
  options: SmartGreetingOptions,
): IntentDetection {
  const normalizedMessage = normalizeIntentMessage(originalMessage);
  const activeRules = rules.filter((rule) => rule.isActive);
  const legacyNormalized = normalizeText(originalMessage);
  const exact = activeRules.find((rule) => normalizeText(rule.phrase) === legacyNormalized);
  if (exact) {
    const canonical = normalizeIntentMessage(exact.phrase);
    const canonicalRule = exact.type === "GREETING"
      ? activeRules.find(
          (rule) =>
            rule.type === "GREETING" &&
            normalizeIntentMessage(rule.phrase) === canonical &&
            normalizeText(rule.phrase) === canonical,
        ) ?? exact
      : exact;
    return result(exact.type, normalizedMessage, {
      matchedRule: canonicalRule,
      matchedCanonicalRule: exact.type === "GREETING" ? canonical : exact.phrase,
      matchMethod: originalMessage.trim().toLowerCase() === exact.phrase.trim().toLowerCase() ? "EXACT" : "NORMALIZED",
    });
  }

  if (!options.enabled) return result("UNKNOWN", normalizedMessage);

  const modifiers = parseModifiers(options.modifiers);
  const rawGreetingRules = activeRules
    .filter((rule) => rule.type === "GREETING")
    .map((rule) => ({ rule, canonical: normalizeIntentMessage(rule.phrase) }))
    .filter((item) => item.canonical);
  const greetingRules = rawGreetingRules.map((item) => ({
    ...item,
    rule:
      rawGreetingRules.find(
        (candidate) =>
          candidate.canonical === item.canonical &&
          normalizeText(candidate.rule.phrase) === item.canonical,
      )?.rule ?? item.rule,
  }));

  let greetingMatch: { rule: IntentRule; canonical: string; method: IntentMatchMethod; consumed: number } | null = null;
  for (const candidate of greetingRules) {
    if (normalizedMessage === candidate.canonical || normalizedMessage.startsWith(`${candidate.canonical} `)) {
      if (!greetingMatch || candidate.canonical.length > greetingMatch.canonical.length) {
        greetingMatch = { ...candidate, method: "NORMALIZED", consumed: candidate.canonical.length };
      }
    }
  }

  if (!greetingMatch && options.fuzzyEnabled) {
    const messageTokens = normalizedMessage.split(" ").filter(Boolean);
    let bestScore = 0;
    for (const candidate of greetingRules) {
      const count = candidate.canonical.split(" ").length;
      const prefix = messageTokens.slice(0, count).join(" ");
      const score = similarity(prefix, candidate.canonical);
      if (score >= options.similarityThreshold && score > bestScore) {
        bestScore = score;
        greetingMatch = { ...candidate, method: "FUZZY", consumed: prefix.length };
      }
    }
  }

  if (greetingMatch) {
    const rawRemainder = normalizedMessage.slice(greetingMatch.consumed).trim();
    const remainder = stripQuestionPreamble(
      stripNonMeaningfulTokens(rawRemainder, modifiers),
    );
    if (isMeaningfulQuestion(remainder, originalMessage)) {
      return result("QUESTION", normalizedMessage, {
        ragQuery: options.stripGreetingFromQuestion
          ? ragQueryFromRemainder(remainder, originalMessage)
          : originalMessage.trim(),
        matchedRule: greetingMatch.rule,
        matchedCanonicalRule: greetingMatch.canonical,
        matchMethod: greetingMatch.method,
        greetingWithQuestion: true,
      });
    }
    return result("GREETING", normalizedMessage, {
      matchedRule: greetingMatch.rule,
      matchedCanonicalRule: greetingMatch.canonical,
      matchMethod: greetingMatch.method,
    });
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(originalMessage) || /^p{1,4}$/i.test(normalizedMessage)) {
    return result("NOISE", normalizedMessage, { matchMethod: "NORMALIZED" });
  }

  const tokens = normalizedMessage.split(" ").filter(Boolean);
  if (isMeaningfulQuestion(normalizedMessage, originalMessage)) {
    return result("QUESTION", normalizedMessage, {
      ragQuery: originalMessage.trim(),
      matchMethod: "NORMALIZED",
    });
  }
  const semanticEligible = tokens.length <= 4 && /\p{L}/u.test(normalizedMessage);
  return result(semanticEligible ? "UNKNOWN" : "QUESTION", normalizedMessage, {
    ragQuery: semanticEligible ? null : originalMessage.trim(),
  });
}

export async function detectSemanticGreeting(
  normalizedMessage: string,
  rules: IntentRule[],
  threshold: number,
): Promise<IntentDetection | null> {
  const greetings = rules.filter((rule) => rule.isActive && rule.type === "GREETING");
  if (!normalizedMessage || greetings.length === 0) return null;
  try {
    const texts = [normalizedMessage, ...greetings.map((rule) => normalizeIntentMessage(rule.phrase))];
    const vectors = await getEmbeddingProvider().embedTexts(texts);
    let bestIndex = -1;
    let bestScore = 0;
    for (let index = 1; index < vectors.length; index += 1) {
      const score = cosineSimilarity(vectors[0], vectors[index]);
      if (score > bestScore) { bestScore = score; bestIndex = index - 1; }
    }
    if (bestIndex < 0 || bestScore < threshold) return null;
    const matchedRule = greetings[bestIndex];
    return result("GREETING", normalizedMessage, {
      matchedRule,
      matchedCanonicalRule: normalizeIntentMessage(matchedRule.phrase),
      matchMethod: "SEMANTIC",
    });
  } catch (error) {
    console.error("[smart-intent] Semantic greeting gagal, lanjut sebagai QUESTION:", error);
    return null;
  }
}
