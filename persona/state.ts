export const MEMORY_STATE_VERSION = 2;
export const MAX_IMPORTANT = 5;
export const MIN_AFFINITY = -100;
export const MAX_AFFINITY = 100;

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  supersededBy?: string;
}

export interface RelationshipRecord {
  personId: string;
  name: string;
  aliases: string[];
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

/** 版本 1 补入空检索词与人物关系；校验失败时调用方不得写回原文件。 */
export function decodeMemoryState(value: unknown): MemoryState {
  const invalid = (): never => { throw new Error(`Memory 状态格式错误或版本不支持（需要 1 或 ${MEMORY_STATE_VERSION}）`); };
  if (!object(value) || (value.version !== 1 && value.version !== MEMORY_STATE_VERSION)
    || !Array.isArray(value.records) || !Array.isArray(value.importantIds) || !Array.isArray(value.history)) return invalid();
  const records = value.records.map((row): MemoryRecord => {
    if (!object(row) || !['id', 'title', 'content', 'createdAt', 'updatedAt'].every((key) => typeof row[key] === 'string')) return invalid();
    const keywords = row.keywords ?? (value.version === 1 ? [] : undefined);
    if (!texts(keywords) || (row.supersededBy !== undefined
      && (typeof row.supersededBy !== 'string' || !row.supersededBy.trim() || row.supersededBy === row.id))) return invalid();
    return { id: row.id as string, title: row.title as string, content: row.content as string,
      keywords, createdAt: row.createdAt as string, updatedAt: row.updatedAt as string,
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
  }
  const relationships = value.relationships ?? (value.version === 1 ? [] : undefined);
  if (!Array.isArray(relationships) || !relationships.every((row) => object(row)
    && ['personId', 'name', 'relationship', 'reason', 'createdAt', 'updatedAt'].every((key) => typeof row[key] === 'string' && row[key].trim())
    && texts(row.aliases) && validAffinity(row.affinity))
    || new Set(relationships.map((row) => row.personId)).size !== relationships.length
    || !value.history.every((row) => object(row) && ['id', 'recordedAt', 'kind'].every((key) => typeof row[key] === 'string'))) return invalid();
  return { version: MEMORY_STATE_VERSION, records, importantIds: value.importantIds,
    relationships: relationships as RelationshipRecord[], history: value.history as unknown as MemoryOperation[] };
}
