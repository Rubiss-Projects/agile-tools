import { startWorker, stopWorker } from './lib/worker.js';
import { logger } from '@agile-tools/shared';

async function main(): Promise<void> {
  await startWorker();

  // Graceful shutdown on SIGTERM / SIGINT (Docker stop, Ctrl-C).
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    try {
      await stopWorker();
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
    process.exit(1);
  });
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
