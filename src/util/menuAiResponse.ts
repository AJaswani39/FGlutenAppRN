import { MenuSafetyLevel } from '../services/menuSafety';
import { isRecord } from './typeGuards';

export interface MenuAiRiskFactor {
  factor: string;
  severity: number;
  description: string;
}

export interface MenuAiResponse {
  overallSafety?: MenuSafetyLevel;
  summary?: string;
  safeItems?: string[];
  cautionItems?: string[];
  warningItems?: string[];
  crossContamRisk?: string;
  riskBreakdown?: MenuAiRiskFactor[];
}

const MENU_AI_KEYS = [
  'overallSafety',
  'summary',
  'safeItems',
  'cautionItems',
  'warningItems',
  'crossContamRisk',
  'riskBreakdown',
] as const;

function parseSafetyLevel(value: unknown): MenuSafetyLevel | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.toLowerCase();
  return normalized === 'safe' || normalized === 'caution' || normalized === 'unknown' || normalized === 'unsafe'
    ? normalized
    : undefined;
}

/**
 * Keeps valid strings; drops junk elements.
 * - non-array → undefined
 * - explicit [] → []
 * - all elements invalid → undefined (so merges can fall back)
 * - some elements valid → keep only valid
 * @param value The value to parse as an array of strings.
 * @returns An array of valid strings, an empty array if the input was an empty array, 
 * or undefined if the input was not an array or contained no valid strings.
 */
function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  if (strings.length > 0) return strings;
  return value.length === 0 ? [] : undefined;
}

/**
 * Keeps valid risk objects; drops junk.
 * Same empty vs all-invalid semantics as parseStringArray.
 * @param value The value to parse as an array of MenuAiRiskFactor objects.
 * @returns An array of valid MenuAiRiskFactor objects, an empty array if the input was an empty array,
 * or undefined if the input was not an array or contained no valid risk objects.
 */
function parseRiskBreakdown(value: unknown): MenuAiRiskFactor[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const factors = value.filter((item): item is MenuAiRiskFactor => {
    if (!isRecord(item)) return false;
    return (
      typeof item.factor === 'string' &&
      typeof item.severity === 'number' &&
      Number.isFinite(item.severity) &&
      typeof item.description === 'string'
    );
  });

  if (factors.length > 0) return factors;
  return value.length === 0 ? [] : undefined;
}

function stripMarkdownFences(raw: string): string {
  return raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
}

/**
 * Attempts to parse a string as JSON and returns the resulting object if it is a valid record.
 * If the string cannot be parsed or does not result in a record, it returns null.
 * @param candidate The string to parse as JSON.
 * @returns A record object if parsing is successful and results in a record; otherwise, null.
 */
function tryParseRecord(candidate: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Extract top-level `{ ... }` slices, respecting JSON string escaping. 
 * This is a best-effort approach and may not handle all edge cases, but it works for the expected menu-AI output.
 * @param text The input string from which to extract JSON objects.
 * @returns An array of strings, each representing a top-level JSON object found in the input text.
*/
function extractBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}
/**
 * Scores a menu AI record based on the presence of expected keys.
 * @param record The record to score.
 * @returns The score as a number.
 */
function scoreMenuAiRecord(record: Record<string, unknown>): number {
  let score = 0;
  for (const key of MENU_AI_KEYS) {
    if (record[key] !== undefined) score += 1;
  }
  return score;
}
/**
 * Selects the best JSON object from a raw string that may contain multiple JSON-like structures.
 * It first attempts to parse the entire string as a single JSON object. If that fails or is not valid,
 * it extracts all top-level JSON objects and scores them based on the presence of expected keys.
 * The object with the highest score is returned. If no valid objects are found, it returns null.
 * @param raw The raw string input that may contain JSON objects.
 * @returns The best-scoring JSON object as a record, or null if none are valid.
 */
function pickBestMenuAiRecord(raw: string): Record<string, unknown> | null {
  const cleaned = stripMarkdownFences(raw);
  if (!cleaned) return null;

  const direct = tryParseRecord(cleaned);
  if (direct && scoreMenuAiRecord(direct) > 0) return direct;

  const candidates = extractBalancedJsonObjects(cleaned)
    .map(tryParseRecord)
    .filter((record): record is Record<string, unknown> => record !== null);

  if (candidates.length === 0) {
    return direct;
  }

  candidates.sort((left, right) => {
    const scoreDelta = scoreMenuAiRecord(right) - scoreMenuAiRecord(left);
    if (scoreDelta !== 0) return scoreDelta;
    return JSON.stringify(right).length - JSON.stringify(left).length;
  });

  const best = candidates[0];
  if (scoreMenuAiRecord(best) > 0) return best;

  // No menu-AI-shaped object; fall back to a direct full-string parse if any.
  return direct ?? best;
}
/**
 * Converts a parsed record into a MenuAiResponse object, ensuring that all fields are validated and properly typed.
 * It uses helper functions to parse safety levels, string arrays, and risk breakdowns, returning undefined for any invalid or missing fields.
 * @param parsed The record to convert into a MenuAiResponse.
 * @returns A MenuAiResponse object with validated fields.
 */
function toMenuAiResponse(parsed: Record<string, unknown>): MenuAiResponse {
  return {
    overallSafety: parseSafetyLevel(parsed.overallSafety),
    summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    safeItems: parseStringArray(parsed.safeItems),
    cautionItems: parseStringArray(parsed.cautionItems),
    warningItems: parseStringArray(parsed.warningItems),
    crossContamRisk:
      typeof parsed.crossContamRisk === 'string' ? parsed.crossContamRisk.trim() || undefined : undefined,
    riskBreakdown: parseRiskBreakdown(parsed.riskBreakdown),
  };
}
/**
 * Parses a raw string into a MenuAiResponse object.
 * @param raw The raw string input that may contain JSON objects.
 * @returns A MenuAiResponse object with validated fields, or null if parsing fails.
 */
export function parseMenuAiResponse(raw: string): MenuAiResponse | null {
  const record = pickBestMenuAiRecord(raw);
  if (!record) return null;
  return toMenuAiResponse(record);
}
