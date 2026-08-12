import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing, TouchTarget } from '../../theme/colors';
import { AiChatMessage, Restaurant } from '../../types/restaurant';
import { PuterAiService } from '../../services/puterAiService';
import { buildMenuAiContext } from '../../util/menuAiContext';
import { logger } from '../../util/logger';
import { impactAsync } from '../../util/haptics';

interface Props {
  restaurant: Restaurant;
  menuText: string;
  initialHistory: AiChatMessage[];
  onHistoryChange: (history: AiChatMessage[]) => void;
  onClose: () => void;
}

const SUGGESTED_QUESTIONS = [
  'Which items appear gluten-free?',
  'What should I ask about cross-contamination?',
  'Does the menu mention a shared fryer?',
];

function ChatModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  if (Platform.OS === 'android') {
    return (
      <View style={StyleSheet.absoluteFill}>
        {children}
      </View>
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {children}
    </Modal>
  );
}

export default function MenuChatSheet({
  restaurant,
  menuText,
  initialHistory,
  onHistoryChange,
  onClose,
}: Props) {
  const [chatHistory, setChatHistory] = useState(initialHistory);
  const [userQuestion, setUserQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  const abortController = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
      abortController.current?.abort();
      abortController.current = null;
    };
  }, []);

  const updateHistory = useCallback((next: AiChatMessage[] | ((current: AiChatMessage[]) => AiChatMessage[])) => {
    setChatHistory((current) => {
      const updated = typeof next === 'function' ? next(current) : next;
      onHistoryChange(updated);
      return updated;
    });
  }, [onHistoryChange]);

  const copyToClipboard = useCallback((text: string) => {
    void ExpoClipboard.setStringAsync(text).catch((copyError: unknown) => {
      const message = copyError instanceof Error ? copyError.message : String(copyError);
      logger.warn(`Failed to copy chat response: ${message}`);
    });
  }, []);

  const askAi = useCallback(async (question = userQuestion) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isAsking) return;

    if (!menuText.trim()) {
      setError('There is no menu text available for this restaurant.');
      return;
    }

    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const modelTimestamp = Date.now() + 1;
    const userMessage: AiChatMessage = { role: 'user', text: trimmedQuestion, timestamp: Date.now() };
    const modelMessage: AiChatMessage = { role: 'model', text: '...', timestamp: modelTimestamp };

    setUserQuestion('');
    setError(null);
    setIsAsking(true);
    impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateHistory((current) => [...current, userMessage, modelMessage]);

    try {
      await PuterAiService.askQuestion(buildMenuAiContext(menuText), trimmedQuestion, (chunk) => {
        if (!isMounted.current) return;
        updateHistory((current) => current.map((message) => (
          message.timestamp === modelTimestamp ? { ...message, text: chunk || '...' } : message
        )));
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }, {
        signal: controller.signal,
        restaurantName: restaurant.name,
        history: [...chatHistory, userMessage],
      });
    } catch (requestError: unknown) {
      const cancelled = requestError instanceof Error && requestError.name === 'AbortError';
      if (isMounted.current && !cancelled) {
        const message = requestError instanceof Error ? requestError.message : String(requestError);
        setError(message || 'Failed to get an AI answer.');
        updateHistory((current) => current.filter((entry) => entry.timestamp !== modelTimestamp));
      }
    } finally {
      if (abortController.current === controller) {
        abortController.current = null;
        if (isMounted.current) setIsAsking(false);
      }
    }
  }, [chatHistory, isAsking, menuText, restaurant.name, updateHistory, userQuestion]);

  const clearHistory = () => {
    updateHistory([]);
    setError(null);
  };

  return (
    <ChatModalWrapper onClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Ask FGluten AI</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{restaurant.name}</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close chat">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {chatHistory.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={30} color={Colors.primary} />
              <Text style={styles.emptyTitle}>Ask about this menu</Text>
              <Text style={styles.emptyText}>Answers are based only on the menu evidence available here.</Text>
              <View style={styles.suggestions}>
                {SUGGESTED_QUESTIONS.map((suggestion) => (
                  <Pressable key={suggestion} style={styles.suggestion} onPress={() => void askAi(suggestion)} disabled={isAsking}>
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.history}>
            {chatHistory.map((message) => (
              <Pressable
                key={message.timestamp}
                style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.modelBubble]}
                onLongPress={() => copyToClipboard(message.text)}
                delayLongPress={300}
              >
                <Text style={[styles.message, message.role === 'user' ? styles.userText : styles.modelText]}>{message.text}</Text>
                {message.role === 'model' && message.text !== '...' && (
                  <Pressable onPress={() => copyToClipboard(message.text)} accessibilityRole="button" accessibilityLabel="Copy response">
                    <Ionicons name="copy-outline" size={15} color={Colors.textMuted} />
                  </Pressable>
                )}
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            value={userQuestion}
            onChangeText={setUserQuestion}
            placeholder="Ask about an ingredient or dish..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="send"
            onSubmitEditing={() => void askAi()}
            editable={!isAsking}
          />
          <Pressable
            style={[styles.sendButton, (!userQuestion.trim() || isAsking) && styles.disabled]}
            onPress={() => void askAi()}
            disabled={!userQuestion.trim() || isAsking}
            accessibilityRole="button"
            accessibilityLabel="Send question"
          >
            {isAsking ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <Ionicons name="send" size={18} color={Colors.textInverse} />}
          </Pressable>
        </View>
        {chatHistory.length > 0 && (
          <Pressable onPress={clearHistory} style={styles.clearButton}>
            <Text style={styles.clearText}>Clear chat history</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </ChatModalWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  handle: { width: 40, height: 4, borderRadius: Radius.full, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  title: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2, maxWidth: 260 },
  closeButton: { width: TouchTarget.minimum, height: TouchTarget.minimum, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: Colors.textSecondary, fontSize: 14 },
  content: { padding: Spacing.md, paddingBottom: Spacing.lg },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  suggestions: { width: '100%', gap: Spacing.sm, marginTop: Spacing.md },
  suggestion: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, backgroundColor: Colors.surface },
  suggestionText: { color: Colors.primary, fontSize: FontSize.sm },
  history: { gap: Spacing.sm },
  bubble: { maxWidth: '88%', padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.xs },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primaryLight, borderBottomRightRadius: 2 },
  modelBubble: { alignSelf: 'flex-start', backgroundColor: Colors.surfaceElevated, borderBottomLeftRadius: 2, borderLeftWidth: 4, borderLeftColor: Colors.primary },
  message: { fontSize: FontSize.sm, lineHeight: 20 },
  userText: { color: Colors.primary, fontWeight: FontWeight.medium },
  modelText: { color: Colors.textPrimary },
  error: { color: Colors.error, backgroundColor: Colors.errorBg, padding: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.md },
  inputArea: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 110, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, color: Colors.textPrimary, fontSize: FontSize.sm },
  sendButton: { width: 44, height: 44, borderRadius: Radius.full, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  clearButton: { alignSelf: 'center', paddingBottom: Spacing.md },
  clearText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});
