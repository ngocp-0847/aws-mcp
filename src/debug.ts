export class DebugLogger {
  private static instance: DebugLogger;
  private isDebugMode: boolean;

  constructor() {
    this.isDebugMode = process.env.DEBUG === '1' || process.env.NODE_ENV === 'development';
  }

  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  debug(message: string, data?: any) {
    if (this.isDebugMode) {
      console.error(`[DEBUG ${new Date().toISOString()}] ${message}`);
      if (data) {
        console.error(JSON.stringify(data, null, 2));
      }
    }
  }

  info(message: string, data?: any) {
    console.error(`[INFO ${new Date().toISOString()}] ${message}`);
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }
  }

  error(message: string, error?: any) {
    console.error(`[ERROR ${new Date().toISOString()}] ${message}`);
    if (error) {
      console.error(error);
    }
  }

  timing<T>(label: string, fn: (...args: any[]) => Promise<T>) {
    return async (...args: any[]): Promise<T> => {
      const start = Date.now();
      try {
        const result = await fn(...args);
        const duration = Date.now() - start;
        this.debug(`${label} completed in ${duration}ms`);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        this.error(`${label} failed after ${duration}ms`, error);
        throw error;
      }
    };
  }
}

export const logger = DebugLogger.getInstance();
