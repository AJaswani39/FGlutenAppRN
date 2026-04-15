/**
 * Simple logging utility that only outputs logs in development
 */
const isDev = __DEV__;

export const logger = {
  warn: (...args: unknown[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (isDev) {
      console.error(...args);
    }
  },
} as const;
