export const MEMORY_STATE_VERSION = 3;
export const MAX_IMPORTANT = 5;
export const MAX_SOURCE_MESSAGE_CHARS = 20_000;
export const MIN_AFFINITY = -100;
export const MAX_AFFINITY = 100;

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  parentId: string | null;
  sourceMessage?: string;
  createdAt: string;
  updatedAt: string;
  supersededBy?: string;
}

export interface RelationshipRecord {
  personId: string;
  name: string;
  aliases: string[];
  memoryNodeId: string | null;
  relationship: string;
  affinity: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryOperation {
  id: string;
  recordedAt: string;
  kind: string;
  details: unknown;
}

export interface MemoryState {
  version: number;
  records: MemoryRecord[];
  importantIds: string[];
  relationships: RelationshipRecord[];
  history: MemoryOperation[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function texts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());
}

export function validAffinity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_AFFINITY && value <= MAX_AFFINITY;
}

/** 旧状态读取时归一化为当前结构；校验失败时调用方不得写回原文件。 */
export function decodeMemoryState(value: unknown): MemoryState {
  const invalid = (): never => { throw new Error(`Memory 状态格式错误或版本不支持（需要 1、2 或 ${MEMORY_STATE_VERSION}）`); };
  if (!object(value) || typeof value.version !== 'number' || ![1, 2, MEMORY_STATE_VERSION].includes(value.version)
    || !Array.isArray(value.records) || !Array.isArray(value.importantIds) || !Array.isArray(value.history)) return invalid();
  const version = value.version;
  const records = value.records.map((row): MemoryRecord => {
    if (!object(row) || !['id', 'title', 'content', 'createdAt', 'updatedAt'].every((key) => typeof row[key] === 'string')) return invalid();
    const keywords = row.keywords ?? (version === 1 ? [] : undefined);
    const parentId = row.parentId === undefined && version < 3 ? null : row.parentId;
    if (!texts(keywords) || (parentId !== null
      && (typeof parentId !== 'string' || !parentId.trim() || parentId === row.id))
      || (row.sourceMessage !== undefined && (typeof row.sourceMessage !== 'string'
        || !row.sourceMessage.trim() || row.sourceMessage.length > MAX_SOURCE_MESSAGE_CHARS))
      || (row.supersededBy !== undefined
      && (typeof row.supersededBy !== 'string' || !row.supersededBy.trim() || row.supersededBy === row.id))) return invalid();
    return { id: row.id as string, title: row.title as string, content: row.content as string,
      keywords, createdAt: row.createdAt as string, updatedAt: row.updatedAt as string,
      parentId: parentId as string | null,
      ...(row.sourceMessage === undefined ? {} : { sourceMessage: row.sourceMessage as string }),
      ...(row.supersededBy === undefined ? {} : { supersededBy: row.supersededBy as string }) };
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length || !texts(value.importantIds) || value.importantIds.length > MAX_IMPORTANT
    || new Set(value.importantIds).size !== value.importantIds.length
    || value.importantIds.some((id) => !byId.has(id) || byId.get(id)!.supersededBy)) return invalid();
  for (const record of records) {
    const seen = new Set([record.id]);
    let next = record.supersededBy;
    while (next !== undefined) {
      if (seen.has(next) || !byId.has(next)) return invalid();
      seen.add(next);
      next = byId.get(next)?.supersededBy;
    }
    seen.clear();
    let parentId = record.parentId ?? null;
    while (parentId !== null) {
      if (seen.has(parentId) || !byId.has(parentId)) return invalid();
      seen.add(parentId);
      parentId = byId.get(parentId)!.parentId ?? null;
    }
  }
  const relationships = value.relationships ?? (version === 1 ? [] : undefined);
  if (!Array.isArray(relationships) || !relationships.every((row) => object(row)
    && ['personId', 'name', 'relationship', 'reason', 'createdAt', 'updatedAt'].every((key) => typeof row[key] === 'string' && row[key].trim())
    && texts(row.aliases) && validAffinity(row.affinity)
    && (row.memoryNodeId === undefined ? version < 3 : row.memoryNodeId === null
      || (typeof row.memoryNodeId === 'string' && byId.has(row.memoryNodeId))))
    || new Set(relationships.map((row) => row.personId)).size !== relationships.length
    || !value.history.every((row) => object(row) && ['id', 'recordedAt', 'kind'].every((key) => typeof row[key] === 'string'))) return invalid();
  return { version: MEMORY_STATE_VERSION, records, importantIds: value.importantIds,
    relationships: (relationships as RelationshipRecord[]).map((row) => ({ ...row,
      memoryNodeId: row.memoryNodeId === undefined ? null : row.memoryNodeId })),
    history: value.history as unknown as MemoryOperation[] };
}
