type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function currentMinLevel(): LogLevel {
  const raw = process.env['LOG_LEVEL'];
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return 'info';
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentMinLevel()]) return;

  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = JSON.stringify(entry) + '\n';
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    write('debug', message, context);
  },
  info(message: string, context?: Record<string, unknown>): void {
    write('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    write('warn', message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    write('error', message, context);
  },
};
