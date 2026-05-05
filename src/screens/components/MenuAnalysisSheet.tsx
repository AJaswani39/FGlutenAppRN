import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme/colors';

interface Props {
  restaurantName: string;
  menuText: string;
  onClose: () => void;
}

interface AnalysisResult {
  overallSafety: 'safe' | 'caution' | 'unknown' | 'unsafe';
  glutenFreeItems: string[];
  warnings: string[];
  crossContamRisk: string;
  summary: string;
}

/**
 * AI-powered menu analysis screen.
 * Mirrors MenuAnalysisBottomSheet.kt — performs local heuristic analysis
 * of raw menu text and surfaces gluten-free evidence.
 *
 * In production this could be backed by Google Vertex AI / Gemini API.
 * For now, a fast local keyword analysis is used.
 */
export default function MenuAnalysisSheet({ restaurantName, menuText, onClose }: Props) {
  const [editableText, setEditableText] = useState(menuText);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-analyse on mount if we have text
  useEffect(() => {
    if (menuText && menuText.trim().length > 10) {
      runAnalysis(menuText);
    }
  }, []);

  const runAnalysis = async (text: string) => {
    if (!text.trim()) {
      setError('Please enter or paste menu text to analyse.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);

    // Simulate async work (replace with real API call if desired)
    await new Promise((r) => setTimeout(r, 900));

    try {
      const result = analyseMenuText(text);
      setAnalysisResult(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setError(`Analysis failed: ${message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const safetyColor =
    analysisResult?.overallSafety === 'safe'
      ? Colors.success
      : analysisResult?.overallSafety === 'caution'
      ? Colors.warning
      : analysisResult?.overallSafety === 'unsafe'
      ? Colors.error
      : Colors.textSecondary;

  const safetyBg =
    analysisResult?.overallSafety === 'safe'
      ? Colors.successBg
      : analysisResult?.overallSafety === 'caution'
      ? Colors.warningBg
      : analysisResult?.overallSafety === 'unsafe'
      ? Colors.errorBg
      : Colors.surfaceElevated;

  const safetyEmoji =
    analysisResult?.overallSafety === 'safe'
      ? '✅'
      : analysisResult?.overallSafety === 'caution'
      ? '⚠️'
      : analysisResult?.overallSafety === 'unsafe'
      ? '❌'
      : '❓';

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>🤖 AI Menu Analysis</Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {restaurantName}
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Menu text input */}
          <Text style={styles.sectionLabel}>MENU TEXT</Text>
          <View style={styles.textArea}>
            <TextInput
              style={styles.textInput}
              multiline
              numberOfLines={6}
              value={editableText}
              onChangeText={setEditableText}
              placeholder="Paste menu text here…"
              placeholderTextColor={Colors.textMuted}
              textAlignVertical="top"
            />
          </View>

          <Pressable
            style={[styles.analyseBtn, isAnalyzing && styles.analyseBtnDisabled]}
            onPress={() => runAnalysis(editableText)}
            disabled={isAnalyzing}
            accessibilityRole="button"
            accessibilityLabel="Analyze menu for gluten-free options"
          >
            {isAnalyzing ? (
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.analyseBtnText}>🤖 Analyse for Gluten-Free Safety</Text>
            )}
          </Pressable>

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Results */}
          {analysisResult && (
            <>
              {/* Overall safety card */}
              <View style={[styles.safetyCard, { backgroundColor: safetyBg }]}>
                <Text style={[styles.safetyEmoji]}>{safetyEmoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.safetyTitle, { color: safetyColor }]}>
                    {analysisResult.overallSafety === 'safe'
                      ? 'Generally Safe for Gluten-Free'
                      : analysisResult.overallSafety === 'caution'
                      ? 'Caution — Some Risk Present'
                      : analysisResult.overallSafety === 'unsafe'
                      ? 'Not Recommended for Celiac'
                      : 'Insufficient Information'}
                  </Text>
                  <Text style={styles.safetySummary}>{analysisResult.summary}</Text>
                </View>
              </View>

              {/* Cross-contamination */}
              {analysisResult.crossContamRisk && (
                <ResultSection title="⚠️ Cross-Contamination Risk">
                  <Text style={styles.resultText}>{analysisResult.crossContamRisk}</Text>
                </ResultSection>
              )}

              {/* GF items */}
              {analysisResult.glutenFreeItems.length > 0 && (
                <ResultSection title={`✅ GF Items Found (${analysisResult.glutenFreeItems.length})`}>
                  {analysisResult.glutenFreeItems.map((item, i) => (
                    <View key={`gf-${item.slice(0, 20)}-${i}`} style={styles.listItem}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.listItemText}>{item}</Text>
                    </View>
                  ))}
                </ResultSection>
              )}

              {/* Warnings */}
              {analysisResult.warnings.length > 0 && (
                <ResultSection title={`🔶 Warnings (${analysisResult.warnings.length})`}>
                  {analysisResult.warnings.map((w, i) => (
                    <View key={`warn-${w.slice(0, 20)}-${i}`} style={styles.listItem}>
                      <Text style={[styles.bullet, { color: Colors.warning }]}>⚠</Text>
                      <Text style={[styles.listItemText, { color: Colors.warning }]}>{w}</Text>
                    </View>
                  ))}
                </ResultSection>
              )}

              <Text style={styles.disclaimer}>
                ⚠️ This analysis is based on keyword scanning and is not a substitute for
                speaking to restaurant staff, especially if you have celiac disease.
              </Text>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={resultStyles.section}>
      <Text style={resultStyles.title}>{title}</Text>
      <View style={resultStyles.body}>{children}</View>
    </View>
  );
}

// ─── Local heuristic analysis (mirrors AIRepository.kt logic) ───────────────

export function analyseMenuText(text: string): AnalysisResult {
  const lower = text.toLowerCase();

  const GF_POSITIVE = [
    /gluten[\s-]?free/i,
    /\bgf\b/i,
    /celiac[\s-]?friendly/i,
    /coeliac[\s-]?friendly/i,
    /no[\s-]gluten/i,
  ];

  const GLUTEN_SOURCES = [
    'wheat',
    'barley',
    'rye',
    'spelt',
    'triticale',
    'malt',
    'semolina',
    'durum',
    'kamut',
    'bulgur',
    'farro',
    'crouton',
    'breaded',
    'battered',
    'flour',
    'pasta',
    'noodle',
    'dumpling',
    'soy sauce',
    'teriyaki',
  ];

  const CC_PATTERNS = [
    /share[\s\w]{0,30}kitchen/gi,
    /cross[\s-]?contamin/gi,
    /same[\s\w]{0,20}fryer/gi,
    /not[\s-]?celiac[\s-]?safe/gi,
    /may contain wheat/gi,
    /processed in a facility/gi,
  ];

  const lines = text.split(/[\n\r]+/);
  const glutenFreeItems: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 10 || trimmed.length > 200) continue;
    
    if (GF_POSITIVE.some((p) => p.test(trimmed))) {
      const cleaned = extractGfItem(trimmed);
      if (cleaned && !glutenFreeItems.some(g => g.toLowerCase() === cleaned.toLowerCase())) {
        glutenFreeItems.push(cleaned);
      }
    }
    if (glutenFreeItems.length >= 12) break;
  }
  
  const warnings: string[] = [];
  const foundGlutenSources = GLUTEN_SOURCES.filter((g) => lower.includes(g));
  if (foundGlutenSources.length > 0) {
    warnings.push(`Gluten-containing: ${foundGlutenSources.slice(0, 6).join(', ')}`);
  }

  let crossContamRisk = '';
  const ccMatches = CC_PATTERNS.flatMap((p) => [...text.matchAll(p)].map((m) => m[0]));
  CC_PATTERNS.forEach((r) => { r.lastIndex = 0; });
  if (ccMatches.length > 0) {
    crossContamRisk = ccMatches.slice(0, 3).join('; ');
    warnings.push('Cross-contamination risk detected');
  }

  const hasPositive = glutenFreeItems.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasCrossContam = ccMatches.length > 0;

  let overallSafety: AnalysisResult['overallSafety'];
  let summary: string;

  if (hasPositive && !hasCrossContam && !hasWarnings) {
    overallSafety = 'safe';
    summary = `Found ${glutenFreeItems.length} gluten-free option${glutenFreeItems.length !== 1 ? 's' : ''} with no detected risks.`;
  } else if (hasPositive && (hasCrossContam || hasWarnings)) {
    overallSafety = 'caution';
    summary = 'GF options found but risk factors detected. Consult staff before ordering.';
  } else if (!hasPositive && hasWarnings) {
    overallSafety = 'unsafe';
    summary = 'No explicit GF options found. Gluten-containing items are present.';
  } else {
    overallSafety = 'unknown';
    summary = 'Insufficient menu information. Contact restaurant directly.';
  }

  return { overallSafety, glutenFreeItems, warnings, crossContamRisk, summary };
}

function extractGfItem(line: string): string {
  let cleaned = line.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  
  if (cleaned.length > 80) {
    const parts = cleaned.split(/[,;]/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 10 && trimmed.length < 60) {
        return capitalizeFirst(trimmed);
      }
    }
    return cleaned.slice(0, 80);
  }
  
  return capitalizeFirst(cleaned);
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  headerSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  closeBtnText: { color: Colors.textSecondary, fontSize: 13 },
  content: { padding: Spacing.md },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  textArea: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    minHeight: 120,
  },
  textInput: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    minHeight: 100,
  },
  analyseBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  analyseBtnDisabled: { opacity: 0.6 },
  analyseBtnText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  errorCard: {
    backgroundColor: Colors.errorBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  safetyEmoji: { fontSize: 28 },
  safetyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: 4 },
  safetySummary: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  listItem: { flexDirection: 'row', gap: Spacing.sm, marginBottom: 4 },
  bullet: { color: Colors.primary, fontSize: FontSize.md },
  listItemText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  resultText: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  disclaimer: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    lineHeight: 17,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },
});

const resultStyles = StyleSheet.create({
  section: { marginBottom: Spacing.md },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing.sm,
  },
  body: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
});
