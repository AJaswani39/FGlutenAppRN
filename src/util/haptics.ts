import * as Haptics from 'expo-haptics';
import { logger } from './logger';
/**
 * Triggers a haptic feedback of the specified style asynchronously.
 * If the haptic feedback fails, a warning is logged but the error is not thrown.
 * @param style The style of haptic feedback to trigger (e.g., light, medium, heavy).
 * @returns void
 */
export function impactAsync(style: Haptics.ImpactFeedbackStyle): void {
  void Haptics.impactAsync(style).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Haptic feedback failed: ${message}`);
  });
}
