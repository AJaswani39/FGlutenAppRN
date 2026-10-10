export interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  context?: Record<string, unknown>;
  severity: 'error' | 'warning' | 'info';
  tags?: Record<string, string>;
}

export interface ErrorReporter {
  report(error: ErrorReport): Promise<void> | void;
  flush?(): Promise<void>;
}

export class ConsoleErrorReporter implements ErrorReporter {
  report(error: ErrorReport): void {
    const prefix = `[${error.severity.toUpperCase()}] ${new Date(error.timestamp).toISOString()}`;
    if (error.severity === 'error') {
      console.error(prefix, error.message, error.stack, error.componentStack);
    } else {
      console.warn(prefix, error.message, error.stack);
    }
  }
}

let globalReporter: ErrorReporter = new ConsoleErrorReporter();

export function setErrorReporter(reporter: ErrorReporter): void {
  globalReporter = reporter;
}

export function getErrorReporter(): ErrorReporter {
  return globalReporter;
}

export async function reportError(
  error: Error,
  context?: Record<string, unknown>,
  options?: { severity?: 'error' | 'warning' | 'info'; tags?: Record<string, string>; componentStack?: string }
): Promise<void> {
  const reporter = getErrorReporter();
  await reporter.report({
    message: error.message,
    stack: error.stack,
    componentStack: options?.componentStack,
    timestamp: Date.now(),
    context,
    severity: options?.severity ?? 'error',
    tags: options?.tags,
  });
}

export function withErrorReporting<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context?: Record<string, unknown>
): T {
  return ((...args: unknown[]) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((error: Error) => {
          reportError(error, context);
          throw error;
        });
      }
      return result;
    } catch (error) {
      reportError(error as Error, context);
      throw error;
    }
  }) as T;
}