import * as Haptics from 'expo-haptics';
import { logger } from './logger';

export function impactAsync(style: Haptics.ImpactFeedbackStyle): void {
  void Haptics.impactAsync(style).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Haptic feedback failed: ${message}`);
  });
}
