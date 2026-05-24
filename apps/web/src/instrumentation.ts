export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeMetrics } = await import('./server/metrics');
    initializeMetrics();
  }
}