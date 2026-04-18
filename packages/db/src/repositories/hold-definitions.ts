import { Prisma, type PrismaClient, type HoldDefinition } from '@prisma/client';

export interface UpsertHoldDefinitionInput {
  holdStatusIds: string[];
  blockedFieldId?: string;
  blockedTruthyValues?: string[];
}

/**
 * Persist a new hold definition version for a scope.
 * Each call creates a new record with effectiveFrom = now() so that the history
 * is preserved and the UI can always show when the definition last changed.
 *
 * Returns the newly created record.
 */
export async function upsertHoldDefinition(
  client: PrismaClient,
  scopeId: string,
  input: UpsertHoldDefinitionInput,
  updatedBy: string,
): Promise<HoldDefinition> {
  if (input.blockedTruthyValues?.length && !input.blockedFieldId) {
    throw new Error('blockedTruthyValues may only be set when blockedFieldId is configured.');
  }

  const effectiveFrom = new Date();

  try {
    return await client.holdDefinition.create({
      data: {
        scopeId,
        holdStatusIds: input.holdStatusIds,
        blockedFieldId: input.blockedFieldId ?? null,
        blockedTruthyValues: input.blockedTruthyValues ?? [],
        effectiveFrom,
        updatedBy,
      },
    });
  } catch (err) {
    // P2002: unique violation on (scopeId, effectiveFrom) — extremely unlikely but retry
    // with a slightly later timestamp to avoid a collision.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return client.holdDefinition.create({
        data: {
          scopeId,
          holdStatusIds: input.holdStatusIds,
          blockedFieldId: input.blockedFieldId ?? null,
          blockedTruthyValues: input.blockedTruthyValues ?? [],
          effectiveFrom: new Date(effectiveFrom.getTime() + 1),
          updatedBy,
        },
      });
    }
    throw err;
  }
}

/**
 * Return the most recently effective hold definition for a scope, or null when
 * no definition has been configured yet.
 */
export async function getActiveHoldDefinition(
  client: PrismaClient,
  scopeId: string,
): Promise<HoldDefinition | null> {
  return client.holdDefinition.findFirst({
    where: {
      scopeId,
      effectiveFrom: { lte: new Date() },
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}
