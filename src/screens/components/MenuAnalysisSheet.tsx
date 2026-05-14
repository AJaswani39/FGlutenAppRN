import React, { useState, useEffect, useRef, useMemo } from 'react';
import Constants from 'expo-constants';
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
  Clipboard,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme/colors';
import { analyseMenuText, MenuAnalysisResult } from '../../services/menuSafety';
import { extractMenuTextFromImage } from '../../services/menuOcr';
import { GeminiService } from '../../services/geminiService';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurants } from '../../context/RestaurantContext';
import { useSettings } from '../../context/SettingsContext';
import { Restaurant, AiChatMessage } from '../../types/restaurant';

interface Props {
  restaurant: Restaurant;
  onClose: () => void;
}

export default function MenuAnalysisSheet({ restaurant, onClose }: Props) {
  const { updateAiSession } = useRestaurants();
  
  // Initialize state from persistent restaurant session if available
  const [editableText, setEditableText] = useState(restaurant.rawMenuText || '');
  const [analysisResult, setAnalysisResult] = useState<MenuAnalysisResult | null>(restaurant.aiAnalysisResult || null);
  const [deepAnalysisMarkdown, setDeepAnalysisMarkdown] = useState<string | null>(restaurant.aiDeepAnalysis || null);
  const [chatHistory, setChatHistory] = useState<AiChatMessage[]>(restaurant.aiChatHistory || []);
  
  const { dairyFree, nutFree, soyFree, strictCeliac } = useSettings();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExtractingPhotoText, setIsExtractingPhotoText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  // AI Chat State
  const [userQuestion, setUserQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    // Initialize Gemini with key from config
    const geminiKey = (Constants.expoConfig?.extra as any)?.GEMINI_API_KEY ?? '';
    GeminiService.init(geminiKey);

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Persist session changes back to context
  useEffect(() => {
    updateAiSession(restaurant, {
      analysis: analysisResult,
      chat: chatHistory,
      deepAnalysis: deepAnalysisMarkdown,
    });
  }, [analysisResult, chatHistory, deepAnalysisMarkdown, restaurant, updateAiSession]);

  // Auto-analyse on mount if we have text but no previous result
  useEffect(() => {
    if (!analysisResult && editableText.trim().length > 10) {
      void runAnalysis(editableText);
    }
  }, []);

  const runAnalysis = async (text: string) => {
    if (!text.trim()) {
      setError('Please enter or paste menu text to analyse.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    
    try {
      // 1. Run local GF analysis for the score
      const result = await analyseMenuText(text);
      if (isMounted.current) {
        setAnalysisResult(result);
      }

      // 2. If secondary allergens are active, run Deep AI Analysis
      if (dairyFree || nutFree || soyFree) {
        const deepResult = await GeminiService.analyzeMenu(text, {
          strictCeliac,
          dairyFree,
          nutFree,
          soyFree,
        });
        if (isMounted.current) {
          setDeepAnalysisMarkdown(deepResult);
        }
      } else {
        setDeepAnalysisMarkdown(null);
      }
    } catch (err: any) {
      if (!isMounted.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(`Analysis failed: ${message}`);
    } finally {
      if (isMounted.current) {
        setIsAnalyzing(false);
      }
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
  };

  const clearChat = () => {
    setChatHistory([]);
    setError(null);
  };

  const askAi = async () => {
    if (!userQuestion.trim()) return;
    setIsAsking(true);
    setError(null);
    
    const questionText = userQuestion;
    setUserQuestion('');

    const snapshotHistorySize = chatHistory.length;

    try {
      const answer = await GeminiService.askQuestion(editableText, questionText);
      if (isMounted.current) {
        // If history was cleared while waiting, don't re-populate it unless the user wants
        const newMessage: AiChatMessage = {
          role: 'user',
          text: questionText,
          timestamp: Date.now(),
        };
        const assistantMessage: AiChatMessage = {
          role: 'model',
          text: answer,
          timestamp: Date.now(),
        };
        
        setChatHistory((prev) => {
          // If the chat was cleared (prev.length < snapshot), we only add the new response if it was empty
          if (prev.length === 0 && snapshotHistorySize > 0) return [];
          return [...prev, newMessage, assistantMessage];
        });
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || 'Failed to get AI answer.');
      }
    } finally {
      if (isMounted.current) {
        setIsAsking(false);
      }
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
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      const pickedAsset = result.assets[0];
      
      const manipulated = await ImageManipulator.manipulateAsync(
        pickedAsset.uri,
        [{ resize: { width: pickedAsset.width > pickedAsset.height ? 1200 : undefined, height: pickedAsset.height >= pickedAsset.width ? 1200 : undefined } }],
        { base64: true, format: ImageManipulator.SaveFormat.JPEG, quality: 0.7 }
      );

      const base64 = manipulated.base64;
      if (!base64) {
        throw new Error('Failed to process image data.');
      }

      const text = await extractMenuTextFromImage(base64);
      if (isMounted.current) {
        const combinedText = editableText ? `${editableText}\n\n${text}` : text;
        setEditableText(combinedText);
        void runAnalysis(combinedText);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || 'Failed to extract text from photo.');
      }
    } finally {
      if (isMounted.current) {
        setIsExtractingPhotoText(false);
      }
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
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>🤖 AI Menu Analysis</Text>
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
              <>
                <Ionicons name="camera" size={20} color={Colors.primary} />
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
              <ActivityIndicator color={Colors.textInverse} />
            ) : (
              <Text style={styles.analyseBtnText}>Run AI Safety Check</Text>
            )}
          </Pressable>

          {(dairyFree || nutFree || soyFree) && (
            <View style={styles.allergenBanner}>
              <Ionicons name="sparkles" size={16} color={Colors.warning} />
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
            <View style={styles.resultContainer}>
              <View style={[styles.overallSafety, { backgroundColor: safetyBg }]}>
                <Text style={[styles.safetyValue, { color: safetyColor }]}>
                  {safetyEmoji} {analysisResult.overallSafety.toUpperCase()}
                </Text>
                <Text style={styles.safetySummary}>{analysisResult.summary}</Text>
              </View>

              <ResultSection title="SAFE OPTIONS (GF)" icon="checkmark-circle" color={Colors.success}>
                {analysisResult.safeItems.length > 0 ? (
                  analysisResult.safeItems.map((item, i) => (
                    <Text key={i} style={styles.listItem}>• {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyList}>No clearly safe items found.</Text>
                )}
              </ResultSection>

              <ResultSection title="PROBABLY SAFE (CAUTION)" icon="warning" color={Colors.warning}>
                {analysisResult.cautionItems.length > 0 ? (
                  analysisResult.cautionItems.map((item, i) => (
                    <Text key={i} style={styles.listItem}>• {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyList}>No caution items found.</Text>
                )}
              </ResultSection>

              <ResultSection title="AVOID (GLUTEN)" icon="close-circle" color={Colors.error}>
                {analysisResult.unsafeItems.length > 0 ? (
                  analysisResult.unsafeItems.map((item, i) => (
                    <Text key={i} style={styles.listItem}>• {item}</Text>
                  ))
                ) : (
                  <Text style={styles.emptyList}>No unsafe items found.</Text>
                )}
              </ResultSection>

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

          {/* AI Chat Section */}
          <View style={styles.aiChatContainer}>
            <Text style={styles.sectionLabel}>ASK FGLUTEN AI</Text>
            
            <View style={styles.chatHistory}>
              {chatHistory.map((msg, i) => (
                <Pressable 
                  key={i} 
                  style={[
                    styles.chatBubble, 
                    msg.role === 'user' ? styles.userBubble : styles.modelBubble
                  ]}
                  onLongPress={() => copyToClipboard(msg.text)}
                  delayLongPress={300}
                >
                  <Text style={[
                    styles.chatText,
                    msg.role === 'user' ? styles.userChatText : styles.modelChatText
                  ]}>
                    {msg.text}
                  </Text>
                  {msg.role === 'model' && (
                    <Pressable style={styles.copyIcon} onPress={() => copyToClipboard(msg.text)}>
                      <Ionicons name="copy-outline" size={12} color={Colors.textMuted} />
                    </Pressable>
                  )}
                </Pressable>
              ))}
            </View>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Ask about an ingredient or dish..."
                placeholderTextColor={Colors.textMuted}
                value={userQuestion}
                onChangeText={setUserQuestion}
                onSubmitEditing={askAi}
              />
              <Pressable 
                style={[styles.askBtn, (!userQuestion.trim() || isAsking) && styles.askBtnDisabled]} 
                onPress={askAi}
                disabled={!userQuestion.trim() || isAsking}
              >
                {isAsking ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Ionicons name="send" size={18} color={Colors.textInverse} />
                )}
              </Pressable>
            </View>
            
            {chatHistory.length > 0 && (
              <Pressable onPress={() => setChatHistory([])} style={styles.clearHistoryBtn}>
                <Text style={styles.clearChatText}>Clear Chat History</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.disclaimer}>
            ⚠️ This analysis is based on keyword scanning and is not a substitute for
            speaking to restaurant staff, especially if you have celiac disease.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ResultSection({ title, icon, color, children }: { title: string; icon: any; color: string; children: React.ReactNode }) {
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  headerSub: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: Colors.textSecondary },
  content: { padding: Spacing.md, paddingBottom: 100 },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  textArea: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  textInput: {
    padding: Spacing.md,
    color: Colors.textPrimary,
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
    borderColor: Colors.primary,
    marginBottom: Spacing.sm,
  },
  photoBtnText: { color: Colors.primary, fontWeight: FontWeight.semiBold, fontSize: FontSize.sm },
  analyseBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  analyseBtnText: { color: Colors.textInverse, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  analyseBtnDisabled: { opacity: 0.5 },
  errorBanner: {
    backgroundColor: Colors.errorBg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  resultContainer: { gap: Spacing.lg },
  overallSafety: { padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.xs },
  safetyValue: { fontSize: FontSize.lg, fontWeight: FontWeight.extraBold },
  safetySummary: { color: Colors.textPrimary, fontSize: FontSize.sm, lineHeight: 20 },
  listItem: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 22 },
  emptyList: { color: Colors.textMuted, fontSize: FontSize.sm, fontStyle: 'italic' },
  disclaimer: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    lineHeight: 17,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
  },
  aiChatContainer: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  allergenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.warningBg,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  allergenBannerText: {
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  deepAnalysisContainer: {
    marginTop: Spacing.md,
  },
  deepAnalysisBox: {
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  deepAnalysisText: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  chatHistory: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  chatBubble: {
    maxWidth: '85%',
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primaryLight,
    borderBottomRightRadius: 2,
  },
  modelBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceElevated,
    borderBottomLeftRadius: 2,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  chatText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  userChatText: {
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },
  modelChatText: {
    color: Colors.textPrimary,
  },
  copyIcon: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    opacity: 0.8,
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  askBtn: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askBtnDisabled: {
    opacity: 0.5,
  },
  clearHistoryBtn: {
    marginTop: Spacing.md,
    alignSelf: 'center',
  },
  clearChatText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});

const resultStyles = StyleSheet.create({
  section: { gap: Spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  title: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  content: { paddingLeft: 22 },
});
