import React, { useState, useEffect } from 'react';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
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
import { analyseMenuText, MenuAnalysisResult } from '../../services/menuSafety';
import { extractMenuTextFromImage } from '../../services/menuOcr';

interface ExpoConfigExtra {
  VISION_API_KEY?: string;
}

interface Props {
  restaurantName: string;
  menuText: string;
  onClose: () => void;
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
  const [analysisResult, setAnalysisResult] = useState<MenuAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExtractingPhotoText, setIsExtractingPhotoText] = useState(false);
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

  const pickMenuPhoto = async () => {
    setError(null);
    setIsExtractingPhotoText(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo access is needed to scan a menu image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        base64: true,
        quality: 0.85,
      });

      if (result.canceled) return;

      const base64 = result.assets[0]?.base64;
      if (!base64) {
        setError('Could not read that image. Try a clearer menu photo.');
        return;
      }

      const visionApiKey = (Constants.expoConfig?.extra as ExpoConfigExtra)?.VISION_API_KEY ?? '';
      const text = await extractMenuTextFromImage({ base64, apiKey: visionApiKey });
      setEditableText(text);
      await runAnalysis(text);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setError(`Photo scan failed: ${message}`);
    } finally {
      setIsExtractingPhotoText(false);
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
            style={[styles.photoBtn, isExtractingPhotoText && styles.analyseBtnDisabled]}
            onPress={pickMenuPhoto}
            disabled={isExtractingPhotoText || isAnalyzing}
            accessibilityRole="button"
            accessibilityLabel="Choose menu photo to scan"
          >
            {isExtractingPhotoText ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <Text style={styles.photoBtnText}>📷 Scan Menu Photo</Text>
            )}
          </Pressable>

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
                      ? `Generally Safe (${analysisResult.score}/100)`
                      : analysisResult.overallSafety === 'caution'
                      ? `Caution (${analysisResult.score}/100)`
                      : analysisResult.overallSafety === 'unsafe'
                      ? `Not Recommended (${analysisResult.score}/100)`
                      : `Insufficient Information (${analysisResult.score}/100)`}
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
  photoBtn: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.sm,
  },
  analyseBtnDisabled: { opacity: 0.6 },
  photoBtnText: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.bold },
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
