import { MenuSafetyLevel } from '../services/menuSafety';

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
  riskBreakdown?: MenuAiRiskFactor[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSafetyLevel(value: unknown): MenuSafetyLevel | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.toLowerCase();
  return normalized === 'safe' || normalized === 'caution' || normalized === 'unknown' || normalized === 'unsafe'
    ? normalized
    : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : undefined;
}

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

  return factors.length === value.length ? factors : undefined;
}

export function parseMenuAiResponse(raw: string): MenuAiResponse | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!isRecord(parsed)) return null;

    return {
      overallSafety: parseSafetyLevel(parsed.overallSafety),
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      safeItems: parseStringArray(parsed.safeItems),
      cautionItems: parseStringArray(parsed.cautionItems),
      warningItems: parseStringArray(parsed.warningItems),
      riskBreakdown: parseRiskBreakdown(parsed.riskBreakdown),
    };
  } catch {
    return null;
  }
}
