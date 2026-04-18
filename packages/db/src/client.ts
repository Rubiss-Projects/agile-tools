import { PrismaClient } from '@prisma/client';

let _client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'warn', 'error']
          : ['warn', 'error'],
    });
  }
  return _client;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = undefined;
  }
}
