import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Spacing, Radius, FontSize, FontWeight, TouchTarget } from '../../theme/colors';
import { ThemeColors, useTheme } from '../../context/ThemeContext';
import {
  alignScoreWithSafetyLevel,
  analyseMenuText,
  MenuAnalysisResult,
} from '../../services/menuSafety';
import { extractMenuTextFromImage } from '../../services/menuOcr';
import { PuterAiService } from '../../services/puterAiService';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurants } from '../../context/RestaurantContext';
import { useSettings } from '../../context/SettingsContext';
import { Restaurant } from '../../types/restaurant';
import { logger } from '../../util/logger';
import { buildMenuAiContext } from '../../util/menuAiContext';
import { parseMenuAiResponse } from '../../util/menuAiResponse';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import SafetyScorecard from './SafetyScorecard';
import { getRuntimeConfig } from '../../config/runtimeConfig';
import type { IconName } from '../../components/ui';

interface Props {
  restaurant: Restaurant;
  onClose: () => void;
}

// Bypasses the infamous Android nested Modal bug by using an absolute overlay on Android
const ModalWrapper = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => {
  const { colors } = useTheme();

  if (Platform.OS === 'android') {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 100, elevation: 10 }]}>
        {children}
      </View>
    );
  }
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {children}
    </Modal>
  );
};

export default function MenuAnalysisSheet({ restaurant, onClose }: Props) {
  const { updateAiSession } = useRestaurants();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  // Initialize state from persistent restaurant session if available
  const [editableText, setEditableText] = useState(restaurant.rawMenuText || '');
  const [analysisResult, setAnalysisResult] = useState<MenuAnalysisResult | null>(restaurant.aiAnalysisResult || null);
  const [deepAnalysisMarkdown, setDeepAnalysisMarkdown] = useState<string | null>(restaurant.aiDeepAnalysis || null);
  
  const { dairyFree, nutFree, soyFree, strictCeliac } = useSettings();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExtractingPhotoText, setIsExtractingPhotoText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  // AI Chat State
  const [isSharing, setIsSharing] = useState(false);
  
  const scorecardRef = useRef(null);
  const analysisAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    // Initialize Puter AI with key from config.
    const config = getRuntimeConfig();
    PuterAiService.init(config.puterApiKey, config.aiProxyBaseUrl);

    return () => {
      isMounted.current = false;
      analysisAbortController.current?.abort();
      analysisAbortController.current = null;
    };
  }, []);

  // Optimization: Track session data in a ref to avoid excessive context re-renders
  // We only sync back to the global RestaurantContext when the sheet is closed (unmount)
  const sessionDataRef = useRef({
    analysis: analysisResult,
    deepAnalysis: deepAnalysisMarkdown,
  });

  useEffect(() => {
    sessionDataRef.current = {
      analysis: analysisResult,
      deepAnalysis: deepAnalysisMarkdown,
    };
  }, [analysisResult, deepAnalysisMarkdown]);

  useEffect(() => {
    return () => {
      // Flush the latest state back to the context on unmount
      updateAiSession(restaurant, sessionDataRef.current);
    };
  }, [restaurant, updateAiSession]);


  const runAnalysis = useCallback(async (text: string) => {
    if (!text.trim()) {
      setError('Please enter or paste menu text to analyse.');
      return;
    }
    analysisAbortController.current?.abort();
    const controller = new AbortController();
    analysisAbortController.current = controller;

    setIsAnalyzing(true);
    setError(null);
    
    try {
      // 1. Run local GF analysis for the score (fast initial feedback)
      // analyseMenuText is synchronous — no await needed
      const localResult = analyseMenuText(text);
      if (isMounted.current) {
        setAnalysisResult(localResult);
      }

      // 2. Run Deep AI Analysis (always if possible, or if allergens active)
      const deepResultRaw = await PuterAiService.analyzeMenu(buildMenuAiContext(text), {
        strictCeliac,
        dairyFree,
        nutFree,
        soyFree,
      }, {
        signal: controller.signal,
      });

      if (isMounted.current) {
        const parsed = parseMenuAiResponse(deepResultRaw);
        if (!parsed) {
          logger.warn('Failed to parse Puter AI JSON, falling back to markdown display');
          setDeepAnalysisMarkdown(deepResultRaw);
        } else {
          // Merge deep results into analysisResult for UI rendering
          setAnalysisResult((prev) => {
            const base = prev ?? localResult;
            const aligned = alignScoreWithSafetyLevel(
              base.score,
              parsed.overallSafety ?? base.overallSafety
            );
            return {
              ...base,
              overallSafety: aligned.overallSafety,
              score: aligned.score,
              summary: parsed.summary ?? base.summary,
              crossContamRisk: parsed.crossContamRisk ?? base.crossContamRisk,
              safeItems: parsed.safeItems ?? base.safeItems ?? [],
              cautionItems: parsed.cautionItems ?? base.cautionItems ?? [],
              unsafeItems: parsed.warningItems ?? base.unsafeItems ?? [],
              riskFactors: parsed.riskBreakdown ?? base.riskFactors ?? [],
            };
          });
          setDeepAnalysisMarkdown(null); // No longer needed as markdown if we have JSON
        }
      }
    } catch (err: unknown) {
      const isCancelled = err instanceof Error && err.name === 'AbortError';
      if (isCancelled) return;
      if (!isMounted.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(`Analysis failed: ${message}`);
    } finally {
      const isCurrentRequest = analysisAbortController.current === controller;
      if (isCurrentRequest) {
        analysisAbortController.current = null;
      }
      if (isMounted.current && isCurrentRequest) {
        setIsAnalyzing(false);
      }
    }
  }, [dairyFree, nutFree, soyFree, strictCeliac]);

  // Auto-analyse on mount if we have text but no previous result.
  // runAnalysis is stable (wrapped in useCallback) so it's safe in this dep array.
  useEffect(() => {
    if (!analysisResult && editableText.trim().length > 10) {
      void runAnalysis(editableText);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAnalysis]);

  const pickMenuPhoto = async () => {
    setError(null);
    setIsExtractingPhotoText(true);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!isMounted.current) return;

      if (!permission.granted) {
        setError('Photo access is needed to scan a menu image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
      if (!isMounted.current) return;

      if (result.canceled || !result.assets[0]) return;

      const pickedAsset = result.assets[0];
      
      const manipulated = await ImageManipulator.manipulateAsync(
        pickedAsset.uri,
        [{ resize: { width: 1024 } }],
        { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.5 }
      );
      if (!isMounted.current) return;

      const base64 = manipulated.base64;
      if (!base64) {
        throw new Error('Failed to process image data.');
      }

      const config = getRuntimeConfig();
      const text = await extractMenuTextFromImage({
        base64,
        apiKey: config.visionApiKey,
        proxyBaseUrl: config.aiProxyBaseUrl,
      });
      if (!isMounted.current) return;

      const combinedText = editableText ? `${editableText}\n\n${text}` : text;
      setEditableText(combinedText);
      void runAnalysis(combinedText);
    } catch (err: unknown) {
      if (isMounted.current) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to extract text from photo.'
        );
      }
    } finally {
      if (isMounted.current) {
        setIsExtractingPhotoText(false);
      }
    }
  };

  const handleShareCard = async () => {
    if (!analysisResult) return;
    setIsSharing(true);
    
    try {
      const uri = await captureRef(scorecardRef, {
        format: 'jpg',
        quality: 0.9,
      });

      if (!isMounted.current) return;
      
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Share ${restaurant.name} Safety Card`,
        UTI: 'public.jpeg',
      });
    } catch {
      if (isMounted.current) {
        setError('Could not generate sharing card.');
      }
    } finally {
      if (isMounted.current) {
        setIsSharing(false);
      }
    }
  };

  const safetyColor =
    analysisResult?.overallSafety === 'safe'
      ? colors.success
      : analysisResult?.overallSafety === 'caution'
      ? colors.warning
      : analysisResult?.overallSafety === 'unsafe'
      ? colors.error
      : colors.textSecondary;

  const safetyBg =
    analysisResult?.overallSafety === 'safe'
      ? colors.successBg
      : analysisResult?.overallSafety === 'caution'
      ? colors.warningBg
      : analysisResult?.overallSafety === 'unsafe'
      ? colors.errorBg
      : colors.surfaceElevated;

  const safetyEmoji =
    analysisResult?.overallSafety === 'safe'
      ? '✅'
      : analysisResult?.overallSafety === 'caution'
      ? '⚠️'
      : analysisResult?.overallSafety === 'unsafe'
      ? '❌'
      : '❓';

  return (
    <ModalWrapper onClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerContent}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.headerTitle}>🤖 AI Menu Analysis</Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: 'bold' }}>
                  v{getRuntimeConfig().appVersion}
                </Text>
              </View>
              <Text style={styles.headerSub} numberOfLines={1}>
                {restaurant.name}
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
          <Text style={styles.sectionLabel}>MENU TEXT</Text>
          <View style={styles.textArea}>
            <TextInput
              style={styles.textInput}
              multiline
              numberOfLines={6}
              value={editableText}
              onChangeText={setEditableText}
              placeholder="Paste menu text here…"
              placeholderTextColor={colors.textMuted}
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
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="camera" size={20} color={colors.primary} />
                <Text style={styles.photoBtnText}>Scan Menu Photo</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.analyseBtn, isAnalyzing && styles.analyseBtnDisabled]}
            onPress={() => runAnalysis(editableText)}
            disabled={isAnalyzing || isExtractingPhotoText}
          >
            {isAnalyzing ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.analyseBtnText}>Run AI Safety Check</Text>
            )}
          </Pressable>

          {(dairyFree || nutFree || soyFree) && (
            <View style={styles.allergenBanner}>
              <Ionicons name="sparkles" size={16} color={colors.warning} />
              <Text style={styles.allergenBannerText}>
                Deep Scan active for: {[dairyFree && 'Dairy', nutFree && 'Nuts', soyFree && 'Soy'].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {analysisResult && (
            <Pressable 
              style={[styles.shareBtn, isSharing && styles.analyseBtnDisabled]} 
              onPress={handleShareCard}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="share-social" size={20} color={colors.primary} />
                  <Text style={styles.shareBtnText}>Share Safety Card</Text>
                </>
              )}
            </Pressable>
          )}

          {analysisResult && (
            <View style={styles.resultContainer}>
              <View style={[styles.overallSafety, { backgroundColor: safetyBg }]}>
                <Text style={[styles.safetyValue, { color: safetyColor }]}>
                  {safetyEmoji} {analysisResult.overallSafety.toUpperCase()}
                </Text>
                <Text style={styles.safetySummary}>{analysisResult.summary}</Text>
              </View>

              <ResultSection title="SAFE OPTIONS (GF)" icon="checkmark-circle" color={colors.success}>
                {(analysisResult.safeItems?.length ?? 0) > 0 ? (
                  (analysisResult.safeItems ?? []).map((item, i) => (
                    <Text key={i} style={styles.listItem}>• {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyList}>No clearly safe items found.</Text>
                )}
              </ResultSection>

              <ResultSection title="PROBABLY SAFE (CAUTION)" icon="warning" color={colors.warning}>
                {(analysisResult.cautionItems?.length ?? 0) > 0 ? (
                  (analysisResult.cautionItems ?? []).map((item, i) => (
                    <Text key={i} style={styles.listItem}>• {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyList}>No caution items found.</Text>
                )}
              </ResultSection>

              <ResultSection title="AVOID (GLUTEN)" icon="close-circle" color={colors.error}>
                {(analysisResult.unsafeItems?.length ?? 0) > 0 ? (
                  (analysisResult.unsafeItems ?? []).map((item, i) => (
                    <Text key={i} style={styles.listItem}>• {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyList}>No unsafe items found.</Text>
                )}
              </ResultSection>

              {analysisResult.riskFactors && analysisResult.riskFactors.length > 0 && (
                <View style={styles.riskMeterSection}>
                  <Text style={styles.sectionLabel}>VISUAL RISK BREAKDOWN</Text>
                  <View style={styles.riskGrid}>
                    {analysisResult.riskFactors.map((rf, i) => (
                      <RiskMeter key={i} factor={rf.factor} severity={rf.severity} description={rf.description} />
                    ))}
                  </View>
                </View>
              )}

              {deepAnalysisMarkdown && (
                <View style={styles.deepAnalysisContainer}>
                  <Text style={styles.sectionLabel}>DEEP AI ANALYSIS (ALLERGENS)</Text>
                  <View style={styles.deepAnalysisBox}>
                    <Text style={styles.deepAnalysisText}>{deepAnalysisMarkdown}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          <Text style={styles.disclaimer}>
            ⚠️ This analysis is based on keyword scanning and is not a substitute for
            speaking to restaurant staff, especially if you have celiac disease.
          </Text>
        </ScrollView>

        {/* Hidden Scorecard for Capture */}
        <View style={styles.hiddenCapture} pointerEvents="none">
          {analysisResult && (
            <ViewShot ref={scorecardRef} options={{ format: 'jpg', quality: 0.9 }}>
              <SafetyScorecard 
                restaurant={restaurant} 
                analysis={analysisResult} 
                allergens={[dairyFree && 'Dairy', nutFree && 'Nuts', soyFree && 'Soy'].filter(Boolean) as string[]}
              />
            </ViewShot>
          )}
        </View>
      </KeyboardAvoidingView>
    </ModalWrapper>
  );
}

function ResultSection({
  title,
  icon,
  color,
  children,
}: {
  title: string;
  icon: IconName;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View style={resultStyles.section}>
      <View style={resultStyles.header}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[resultStyles.title, { color }]}>{title}</Text>
      </View>
      <View style={resultStyles.content}>{children}</View>
    </View>
  );
}

function RiskMeter({ factor, severity, description }: { factor: string; severity: number; description: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = severity > 0.7 ? colors.error : severity > 0.3 ? colors.warning : colors.success;
  
  return (
    <View style={styles.riskItem}>
      <View style={styles.riskHeader}>
        <Text style={styles.riskFactorName}>{factor}</Text>
        <Text style={[styles.riskSeverityText, { color }]}>
          {Math.round(severity * 100)}% Risk
        </Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${severity * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.riskDescription}>{description}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingTop: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: TouchTarget.minimum,
    height: TouchTarget.minimum,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: colors.textSecondary },
  content: { padding: Spacing.md, paddingBottom: 100 },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: colors.textMuted,
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  textArea: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.md,
  },
  textInput: {
    padding: Spacing.md,
    color: colors.textPrimary,
    fontSize: FontSize.sm,
    height: 120,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: Spacing.sm,
  },
  photoBtnText: { color: colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  analyseBtn: {
    backgroundColor: colors.primary,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  analyseBtnText: { color: colors.textInverse, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  analyseBtnDisabled: { opacity: 0.5 },
  errorBanner: {
    backgroundColor: colors.errorBg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
  },
  errorText: { color: colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  resultContainer: { gap: Spacing.lg },
  overallSafety: { padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.xs },
  safetyValue: { fontSize: FontSize.lg, fontWeight: FontWeight.extraBold },
  safetySummary: { color: colors.textPrimary, fontSize: FontSize.sm, lineHeight: 20 },
  listItem: { color: colors.textSecondary, fontSize: FontSize.sm, lineHeight: 22 },
  emptyList: { color: colors.textMuted, fontSize: FontSize.sm, fontStyle: 'italic' },
  disclaimer: {
    color: colors.textMuted,
    fontSize: FontSize.xs,
    lineHeight: 17,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },
  allergenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.warningBg,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  allergenBannerText: {
    color: colors.warning,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  deepAnalysisContainer: {
    marginTop: Spacing.md,
  },
  deepAnalysisBox: {
    backgroundColor: colors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  deepAnalysisText: {
    color: colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: Spacing.lg,
    backgroundColor: colors.surface,
  },
  shareBtnText: {
    color: colors.primary,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  hiddenCapture: {
    position: 'absolute',
    left: -2000, // Way off screen
    top: 0,
  },
  riskMeterSection: {
    marginTop: Spacing.md,
    backgroundColor: colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  riskGrid: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  riskItem: {
    gap: 4,
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  riskFactorName: {
    color: colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  riskSeverityText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extraBold,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  riskDescription: {
    color: colors.textSecondary,
    fontSize: FontSize.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  });
}

const resultStyles = StyleSheet.create({
  section: { gap: Spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  content: { paddingLeft: 22 },
});
