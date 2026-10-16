import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import seedSynonyms from './synonyms.json';
import { decodeMemoryState, MAX_AFFINITY, MAX_IMPORTANT, MAX_SOURCE_MESSAGE_CHARS, MEMORY_STATE_VERSION, MIN_AFFINITY, validAffinity,
  type MemoryState, type MemoryRecord, type RelationshipRecord } from './state.ts';

export { MAX_AFFINITY, MAX_IMPORTANT, MEMORY_STATE_VERSION, MIN_AFFINITY } from './state.ts';
export type { MemoryOperation, MemoryRecord, RelationshipRecord } from './state.ts';

export const MAX_CANDIDATES = 20;
export const MAX_RESULTS = 5;
export const MAX_AUTO_RECALL = 10;
export interface MemoryQuery {
  keywords?: unknown;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  offset?: unknown;
}
export interface CurrentMemoryQuery extends MemoryQuery {
  includeSuperseded?: unknown;
}

function queryOptions(query: MemoryQuery) {
  const timestamp = (value: unknown): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) throw new Error('时间必须是带时区的 ISO 时间');
    return Date.parse(value);
  };
  const from = timestamp(query.from);
  const to = timestamp(query.to);
  if (from !== undefined && to !== undefined && from > to) throw new Error('from 不能晚于 to');
  const integer = (value: unknown, fallback: number, min: number, max: number): number => {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`分页值必须是 ${min} 到 ${max} 的整数`);
    }
    return value;
  };
  return { from, to, keywords: query.keywords === undefined ? [] : terms(query.keywords),
    limit: integer(query.limit, 20, 1, 100), offset: integer(query.offset, 0, 0, Number.MAX_SAFE_INTEGER) };
}

function queryRecords<T>(rows: T[], query: MemoryQuery, at: (row: T) => string, text: (row: T) => string) {
  const options = queryOptions(query);
  const matches = rows.map((row, index) => ({ row, index, at: Date.parse(at(row)) }))
    .filter((entry) => (options.from === undefined || entry.at >= options.from)
      && (options.to === undefined || entry.at <= options.to)
      && options.keywords.every((term) => normalize(text(entry.row)).includes(term)))
    .sort((a, b) => b.at - a.at || b.index - a.index);
  const items = matches.slice(options.offset, options.offset + options.limit).map(({ row }) => row);
  return { items, total: matches.length,
    nextOffset: options.offset + items.length < matches.length ? options.offset + items.length : null };
}
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
export function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} 必须是非空字符串`);
  return value.trim();
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('und');
}

function terms(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error('关键词必须是非空字符串数组');
  return [...new Set(value.map((v) => normalize(requiredText(v, '关键词'))))];
}

function synonymKey(group: string[]): string {
  return [...group].sort().join('\0');
}

function textList(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${name} 必须是字符串数组`);
  const unique = new Map<string, string>();
  for (const item of value) {
    const text = requiredText(item, name);
    if (!unique.has(normalize(text))) unique.set(normalize(text), text);
  }
  return [...unique.values()];
}

export class MemoryStore {
  private readonly file: string;
  private readonly synonymsFile: string;
  private readonly stateFile: string;

  constructor(private readonly directory: string, private readonly now: () => string) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, 'memories.json');
    this.synonymsFile = join(directory, 'synonyms.json');
    this.stateFile = join(directory, 'memory-state.json');
    if (!existsSync(this.file)) this.save(this.file, []);
    if (!existsSync(this.synonymsFile)) this.save(this.synonymsFile, seedSynonyms);
  }

  private save(file: string, value: unknown): void {
    const temporary = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
  }

  private freshState(records: MemoryRecord[] = []): MemoryState {
    return { version: MEMORY_STATE_VERSION, records, importantIds: [], relationships: [], history: [] };
  }

  private legacyRecords(): MemoryRecord[] {
    const data: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
    return decodeMemoryState({ version: 1, records: data, importantIds: [], history: [] }).records;
  }

  private state(): MemoryState {
    if (!existsSync(this.stateFile)) return this.freshState(this.legacyRecords());
    return decodeMemoryState(JSON.parse(readFileSync(this.stateFile, 'utf8')));
  }

  private records(): MemoryRecord[] { return this.state().records; }

  private saveState(state: MemoryState): void {
    if (existsSync(this.stateFile)) {
      const old = JSON.parse(readFileSync(this.stateFile, 'utf8')) as { version?: unknown };
      if (typeof old.version === 'number' && old.version < MEMORY_STATE_VERSION) {
        const snapshot = join(this.directory, `memory-state.v${old.version}.json`);
        if (!existsSync(snapshot)) copyFileSync(this.stateFile, snapshot);
      }
    }
    this.save(this.stateFile, state);
  }

  private commit(state: MemoryState, kind: string, details: unknown): void {
    state.version = MEMORY_STATE_VERSION;
    state.history.push({ id: randomUUID(), recordedAt: this.now(), kind, details });
    this.saveState(state);
  }

  audit(kind: string, details: unknown): void {
    this.commit(this.state(), kind, details);
  }

  backup(): string {
    const backupFile = `${this.stateFile}.bak-${this.now().replace(/[:.]/g, '-')}-${randomUUID()}`;
    this.save(backupFile, this.state());
    return backupFile;
  }

  restore(backupFile: unknown): void {
    const file = requiredText(backupFile, 'backupFile');
    const restored = decodeMemoryState(JSON.parse(readFileSync(file, 'utf8')));
    this.saveState(restored);
  }

  important(): MemoryRecord[] {
    const state = this.state();
    return state.importantIds.map((id) => state.records.find((record) => record.id === id)!);
  }

  markImportant(id: unknown, important: unknown) {
    const key = requiredText(id, 'id');
    if (typeof important !== 'boolean') throw new Error('important 必须是布尔值');
    const state = this.state();
    const record = state.records.find((r) => r.id === key);
    if (!record) throw new Error('记忆 id 不存在');
    if (important && record.supersededBy) throw new Error('已被替代的记忆不能标记为重要，请使用替代目标');
    let replaced: MemoryRecord | null = null;
    if (important && !state.importantIds.includes(key)) {
      if (state.importantIds.length === MAX_IMPORTANT) {
        const oldest = state.importantIds.shift()!;
        replaced = state.records.find((r) => r.id === oldest)!;
      }
      state.importantIds.push(key);
    } else if (!important) state.importantIds = state.importantIds.filter((id) => id !== key);
    const result = { record, important, replaced,
      reminder: replaced ? `重要记忆已达 ${MAX_IMPORTANT} 条，已取消「${replaced.title}」(${replaced.id}) 的重要标记，原记忆保留。` : null };
    this.commit(state, 'important', result);
    return result;
  }

  query(query: CurrentMemoryQuery = {}) {
    if (query.includeSuperseded !== undefined && typeof query.includeSuperseded !== 'boolean') {
      throw new Error('includeSuperseded 必须是布尔值');
    }
    return queryRecords(this.records().filter((record) => query.includeSuperseded || !record.supersededBy), query,
      (record) => record.updatedAt, (record) => `${record.title}\n${record.keywords.join('\n')}\n${record.content}`);
  }

  history(query: MemoryQuery = {}) {
    return queryRecords(this.state().history, query, (entry) => entry.recordedAt,
      (entry) => JSON.stringify(entry));
  }

  write(title: unknown, content: unknown, id?: unknown, keywords?: unknown,
    parentId?: unknown, sourceMessage?: unknown): MemoryRecord {
    const recordTitle = requiredText(title, 'title');
    const recordContent = requiredText(content, 'content');
    const state = this.state();
    const records = state.records;
    const existing = id === undefined ? undefined : records.find((r) => r.id === requiredText(id, 'id'));
    if (id !== undefined && !existing) throw new Error('记忆 id 不存在');
    if (existing?.supersededBy) throw new Error('已被替代的记忆不能更新，请使用替代目标');
    const recordId = existing?.id ?? randomUUID();
    const nextParentId = parentId === undefined ? existing?.parentId ?? null
      : this.validateParentId(state, parentId, recordId);
    const nextSourceMessage = sourceMessage === undefined ? existing?.sourceMessage
      : sourceMessage === null ? undefined : this.sourceMessage(sourceMessage);
    const at = this.now();
    const record = {
      id: recordId, title: recordTitle, content: recordContent, parentId: nextParentId,
      keywords: keywords === undefined ? existing?.keywords ?? [] : textList(keywords, 'keywords'),
      createdAt: existing?.createdAt ?? at, updatedAt: at,
      ...(nextSourceMessage === undefined ? {} : { sourceMessage: nextSourceMessage }),
    };
    state.records = [...records.filter((r) => r.id !== record.id), record];
    this.commit(state, existing ? 'update' : 'create', { before: existing ?? null, after: record });
    return record;
  }

  private sourceMessage(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error('sourceMessage 必须是非空字符串');
    if (value.length > MAX_SOURCE_MESSAGE_CHARS) throw new Error(`sourceMessage 不能超过 ${MAX_SOURCE_MESSAGE_CHARS} 个字符`);
    return value;
  }

  private validateParentId(state: MemoryState, value: unknown, recordId: string): string | null {
    if (value === null) return null;
    const parentId = requiredText(value, 'parentId');
    let currentId: string | null = parentId;
    while (currentId !== null) {
      if (currentId === recordId) throw new Error('父节点不能是自身或其后代');
      const parent = state.records.find((record) => record.id === currentId);
      if (!parent) throw new Error('父记忆 id 不存在');
      currentId = parent.parentId ?? null;
    }
    return parentId;
  }

  nodes() {
    return this.records().map(({ id, title, parentId, supersededBy }) => ({ id, title, parentId: parentId ?? null, supersededBy }));
  }

  children(parentId: unknown = null) {
    const state = this.state();
    let key: string | null = null;
    if (parentId !== null) {
      key = requiredText(parentId, 'parentId');
      if (!state.records.some((record) => record.id === key)) throw new Error('父记忆 id 不存在');
    }
    const items = state.records.filter((record) => (record.parentId ?? null) === key);
    return { parentId: key, items, total: items.length };
  }

  trace(id: unknown) {
    const state = this.state();
    const key = requiredText(id, 'id');
    const record = state.records.find((item) => item.id === key);
    if (!record) throw new Error('记忆 id 不存在');
    const ancestors: MemoryRecord[] = [];
    let parentId = record.parentId ?? null;
    while (parentId !== null) {
      const parent = state.records.find((item) => item.id === parentId);
      if (!parent) throw new Error(`记忆父节点不存在：${parentId}`);
      ancestors.push(parent);
      parentId = parent.parentId;
    }
    ancestors.reverse();
    return { path: [...ancestors, record], children: state.records.filter((item) => (item.parentId ?? null) === key) };
  }

  supersede(ids: unknown, replacementId: unknown, reason: unknown) {
    const sourceIds = textList(ids, 'ids');
    if (!sourceIds.length) throw new Error('至少需要一个被替代 id');
    const targetId = requiredText(replacementId, 'replacementId');
    const explanation = requiredText(reason, 'reason');
    const state = this.state();
    const replacement = state.records.find((record) => record.id === targetId);
    if (!replacement || replacement.supersededBy) throw new Error('替代目标必须是当前有效记忆');
    const sources = this.activeSources(state, sourceIds);
    if (sourceIds.includes(targetId)) throw new Error('不能用记忆替代自身');
    return this.replace(state, sources, replacement, explanation, 'supersede');
  }

  merge(ids: unknown, title: unknown, content: unknown, keywords: unknown, reason: unknown) {
    const sourceIds = textList(ids, 'ids');
    if (sourceIds.length < 2) throw new Error('合并至少需要两个不同的 id');
    const state = this.state();
    const sources = this.activeSources(state, sourceIds);
    const at = this.now();
    const replacement: MemoryRecord = { id: randomUUID(), title: requiredText(title, 'title'),
      content: requiredText(content, 'content'), keywords: keywords === undefined
        ? textList(sources.flatMap((record) => record.keywords), 'keywords') : textList(keywords, 'keywords'),
      parentId: sources.every((record) => record.parentId === sources[0].parentId) ? sources[0].parentId : null,
      createdAt: at, updatedAt: at };
    const explanation = requiredText(reason, 'reason');
    state.records.push(replacement);
    return this.replace(state, sources, replacement, explanation, 'merge');
  }

  private activeSources(state: MemoryState, ids: string[]): MemoryRecord[] {
    return ids.map((id) => {
      const record = state.records.find((row) => row.id === id);
      if (!record || record.supersededBy) throw new Error(`被替代 id 不存在或已被替代：${id}`);
      return record;
    });
  }

  private replace(state: MemoryState, sources: MemoryRecord[], replacement: MemoryRecord, reason: string, kind: string) {
    const sourceIds = new Set(sources.map((record) => record.id));
    const before = sources.map((record) => ({ ...record }));
    const at = this.now();
    for (const record of sources) { record.supersededBy = replacement.id; record.updatedAt = at; }
    const transferredImportant = state.importantIds.some((id) => sourceIds.has(id));
    if (transferredImportant) {
      state.importantIds = [...new Set(state.importantIds.map((id) => sourceIds.has(id) ? replacement.id : id))];
    }
    const result = { record: replacement, superseded: sources, transferredImportant, reason };
    this.commit(state, kind, { before, ...result });
    return result;
  }

  readRelationship(personId: unknown): RelationshipRecord | null {
    const key = requiredText(personId, 'personId');
    return this.state().relationships.find((record) => record.personId === key) ?? null;
  }

  queryRelationships(query: MemoryQuery = {}) {
    return queryRecords(this.state().relationships, query, (record) => record.updatedAt, (record) => JSON.stringify(record));
  }

  writeRelationship(args: Record<string, unknown>): RelationshipRecord {
    const personId = requiredText(args.personId, 'personId');
    const state = this.state();
    const before = state.relationships.find((record) => record.personId === personId);
    if (!validAffinity(args.affinity)) throw new Error(`affinity 必须是 ${MIN_AFFINITY} 到 ${MAX_AFFINITY} 的有限数字`);
    const memoryNodeId = args.memoryNodeId === undefined ? before?.memoryNodeId ?? null
      : args.memoryNodeId === null ? null : requiredText(args.memoryNodeId, 'memoryNodeId');
    if (memoryNodeId !== null && !state.records.some((record) => record.id === memoryNodeId)) {
      throw new Error('关联的记忆节点不存在');
    }
    const at = this.now();
    const after: RelationshipRecord = { personId, name: requiredText(args.name, 'name'),
      aliases: args.aliases === undefined ? before?.aliases ?? [] : textList(args.aliases, 'aliases'),
      memoryNodeId, relationship: requiredText(args.relationship, 'relationship'), affinity: args.affinity,
      reason: requiredText(args.reason, 'reason'), createdAt: before?.createdAt ?? at, updatedAt: at };
    state.relationships = [...state.relationships.filter((record) => record.personId !== personId), after];
    this.commit(state, 'relationship_write', { before: before ?? null, after });
    return after;
  }

  deleteRelationship(personId: unknown): boolean {
    const key = requiredText(personId, 'personId');
    const state = this.state();
    const before = state.relationships.find((record) => record.personId === key);
    if (!before) return false;
    state.relationships = state.relationships.filter((record) => record.personId !== key);
    this.commit(state, 'relationship_delete', { before });
    return true;
  }

  read(id: unknown): MemoryRecord | null {
    const key = requiredText(id, 'id');
    return this.records().find((r) => r.id === key) ?? null;
  }

  delete(id: unknown): boolean {
    const key = requiredText(id, 'id');
    const state = this.state();
    if (state.records.some((record) => record.supersededBy === key)) {
      throw new Error('该记忆是替代目标，请先处理引用它的旧记忆');
    }
    const records = state.records;
    const before = records.find((record) => record.id === key);
    if (!before) return false;
    if (records.some((record) => record.parentId === key)) throw new Error('该节点有子节点，请先移动或删除子节点');
    if (state.relationships.some((record) => record.memoryNodeId === key)) {
      throw new Error('该节点关联人物关系，请先解除关系链接');
    }
    const remaining = records.filter((r) => r.id !== key);
    state.records = remaining;
    state.importantIds = state.importantIds.filter((id) => id !== key);
    this.commit(state, 'delete', { before });
    return true;
  }

  private synonyms(): string[][] {
    const data: unknown = JSON.parse(readFileSync(this.synonymsFile, 'utf8'));
    if (!Array.isArray(data)) throw new Error('synonyms.json 必须是词组数组');
    return data.map(terms);
  }

  synonymGroups(): string[][] { return this.synonyms().map((group) => [...group]); }

  addSynonyms(value: unknown): string[] {
    const group = terms(value);
    if (group.length < 2) throw new Error('同义词组至少需要两个不同的词');
    const groups = this.synonyms();
    if (groups.some((existing) => synonymKey(existing) === synonymKey(group))) throw new Error('同义词组已存在');
    this.save(this.synonymsFile, [...groups, group]);
    this.commit(this.state(), 'synonyms_add', { after: group });
    return group;
  }

  updateSynonyms(beforeValue: unknown, afterValue: unknown): string[] {
    const before = terms(beforeValue);
    const after = terms(afterValue);
    if (before.length < 2 || after.length < 2) throw new Error('同义词组至少需要两个不同的词');
    const groups = this.synonyms();
    const index = groups.findIndex((group) => synonymKey(group) === synonymKey(before));
    if (index < 0) throw new Error('同义词组不存在或已被修改');
    if (groups.some((group, i) => i !== index && synonymKey(group) === synonymKey(after))) {
      throw new Error('同义词组已存在');
    }
    const previous = groups[index];
    groups[index] = after;
    this.save(this.synonymsFile, groups);
    this.commit(this.state(), 'synonyms_update', { before: previous, after });
    return after;
  }

  deleteSynonyms(value: unknown): boolean {
    const target = terms(value);
    const groups = this.synonyms();
    const index = groups.findIndex((group) => synonymKey(group) === synonymKey(target));
    if (index < 0) throw new Error('同义词组不存在或已被修改');
    const [before] = groups.splice(index, 1);
    this.save(this.synonymsFile, groups);
    this.commit(this.state(), 'synonyms_delete', { before });
    return true;
  }

  expandSynonyms(value: unknown): string[] {
    const expanded = new Set(terms(value));
    const groups = this.synonyms();
    let previousSize: number;
    do {
      previousSize = expanded.size;
      for (const group of groups) {
        if (group.some((term) => expanded.has(term))) group.forEach((term) => expanded.add(term));
      }
    } while (expanded.size !== previousSize);
    return [...expanded];
  }

  /** 本地词匹配是语义检索的低调用成本 fallback，排名不代表模型判断的相关性。 */
  recallFromText(text: string): MemoryRecord[] {
    const normalized = normalize(text);
    const keywords = new Set([...segmenter.segment(normalized)]
      .filter((part) => part.isWordLike && [...part.segment].length >= 2)
      .map((part) => part.segment));
    for (const group of this.synonyms()) {
      for (const term of group) {
        if (normalized.includes(term)) keywords.add(term);
      }
    }
    if (!keywords.size) return [];
    return this.candidates([...keywords]).records.slice(0, MAX_AUTO_RECALL);
  }

  candidates(value: unknown): { keywords: string[]; expanded: string[]; records: MemoryRecord[] } {
    const keywords = terms(value);
    const expanded = this.expandSynonyms(keywords);
    const ranked = this.records().filter((record) => !record.supersededBy).map((record) => {
      const fields = [record.title, ...record.keywords].map(normalize);
      const score = expanded.filter((term) => fields.some((field) => field.includes(term))).length;
      return { record, score };
    }).filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt)
        || a.record.id.localeCompare(b.record.id));
    return { keywords, expanded, records: ranked.slice(0, MAX_CANDIDATES).map(({ record }) => record) };
  }
}
