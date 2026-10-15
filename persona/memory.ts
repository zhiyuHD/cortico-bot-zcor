import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import seedSynonyms from './synonyms.json';

export const MAX_CANDIDATES = 20;
export const MAX_RESULTS = 5;
export const MAX_AUTO_RECALL = 10;
export const MAX_IMPORTANT = 5;
export const MEMORY_STATE_VERSION = 1;

export interface MemoryOperation {
  id: string;
  recordedAt: string;
  kind: string;
  details: unknown;
}
interface MemoryState {
  version: number;
  records: MemoryRecord[];
  importantIds: string[];
  history: MemoryOperation[];
}
export interface MemoryQuery {
  keywords?: unknown;
  from?: unknown;
  to?: unknown;
  limit?: unknown;
  offset?: unknown;
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
export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

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

export class MemoryStore {
  private readonly file: string;
  private readonly synonymsFile: string;
  private readonly stateFile: string;

  constructor(directory: string, private readonly now: () => string) {
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
    return { version: MEMORY_STATE_VERSION, records, importantIds: [], history: [] };
  }

  private legacyRecords(): MemoryRecord[] {
    const data: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
    if (!Array.isArray(data) || !data.every((v) => v && typeof v === 'object'
      && ['id', 'title', 'content', 'createdAt', 'updatedAt'].every((key) => typeof v[key] === 'string'))) {
      throw new Error('memories.json 格式错误');
    }
    return data;
  }

  private state(): MemoryState {
    if (!existsSync(this.stateFile)) return this.freshState(this.legacyRecords());
    const state = JSON.parse(readFileSync(this.stateFile, 'utf8')) as MemoryState;
    if (!state || state.version !== MEMORY_STATE_VERSION || !Array.isArray(state.records) || !state.records.every((record) => record
      && ['id', 'title', 'content', 'createdAt', 'updatedAt'].every((key) =>
        typeof (record as unknown as Record<string, unknown>)[key] === 'string'))
      || !Array.isArray(state.importantIds) || state.importantIds.length > MAX_IMPORTANT
      || new Set(state.importantIds).size !== state.importantIds.length
      || !state.importantIds.every((id) => typeof id === 'string' && state.records.some((r) => r.id === id))
      || !Array.isArray(state.history) || !state.history.every((entry) => entry
        && typeof entry.id === 'string' && typeof entry.recordedAt === 'string' && typeof entry.kind === 'string')) {
      throw new Error(`memory-state.json 格式错误或版本不支持（需要 ${MEMORY_STATE_VERSION}）`);
    }
    return state;
  }

  private records(): MemoryRecord[] { return this.state().records; }

  private commit(state: MemoryState, kind: string, details: unknown): void {
    state.version = MEMORY_STATE_VERSION;
    state.history.push({ id: randomUUID(), recordedAt: this.now(), kind, details });
    this.save(this.stateFile, state);
  }

  audit(kind: string, details: unknown): void {
    this.commit(this.state(), kind, details);
  }

  backup(): string {
    const backupFile = `${this.stateFile}.bak-${this.now().replace(/[:.]/g, '-')}`;
    writeFileSync(backupFile, readFileSync(this.stateFile, 'utf8'), 'utf8');
    return backupFile;
  }

  restore(backupFile: unknown): void {
    const file = requiredText(backupFile, 'backupFile');
    const restored = JSON.parse(readFileSync(file, 'utf8')) as MemoryState;
    if (restored.version !== MEMORY_STATE_VERSION || !Array.isArray(restored.records)
      || !Array.isArray(restored.importantIds) || !Array.isArray(restored.history)) {
      throw new Error(`备份格式错误或版本不支持（需要 ${MEMORY_STATE_VERSION}）`);
    }
    this.save(this.stateFile, restored);
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

  query(query: MemoryQuery = {}) {
    return queryRecords(this.records(), query, (record) => record.updatedAt,
      (record) => `${record.title}\n${record.content}`);
  }

  history(query: MemoryQuery = {}) {
    return queryRecords(this.state().history, query, (entry) => entry.recordedAt,
      (entry) => JSON.stringify(entry));
  }

  write(title: unknown, content: unknown, id?: unknown): MemoryRecord {
    const recordTitle = requiredText(title, 'title');
    const recordContent = requiredText(content, 'content');
    const state = this.state();
    const records = state.records;
    const existing = id === undefined ? undefined : records.find((r) => r.id === requiredText(id, 'id'));
    if (id !== undefined && !existing) throw new Error('记忆 id 不存在');
    const at = this.now();
    const record = {
      id: existing?.id ?? randomUUID(), title: recordTitle, content: recordContent,
      createdAt: existing?.createdAt ?? at, updatedAt: at,
    };
    state.records = [...records.filter((r) => r.id !== record.id), record];
    this.commit(state, existing ? 'update' : 'create', { before: existing ?? null, after: record });
    return record;
  }

  read(id: unknown): MemoryRecord | null {
    const key = requiredText(id, 'id');
    return this.records().find((r) => r.id === key) ?? null;
  }

  delete(id: unknown): boolean {
    const key = requiredText(id, 'id');
    const state = this.state();
    const records = state.records;
    const remaining = records.filter((r) => r.id !== key);
    if (remaining.length === records.length) return false;
    state.records = remaining;
    state.importantIds = state.importantIds.filter((id) => id !== key);
    this.commit(state, 'delete', { before: records.find((record) => record.id === key) });
    return true;
  }

  private synonyms(): string[][] {
    const data: unknown = JSON.parse(readFileSync(this.synonymsFile, 'utf8'));
    if (!Array.isArray(data)) throw new Error('synonyms.json 必须是词组数组');
    return data.map(terms);
  }

  addSynonyms(value: unknown): string[] {
    const group = terms(value);
    if (group.length < 2) throw new Error('同义词组至少需要两个不同的词');
    const groups = this.synonyms();
    this.save(this.synonymsFile, [...groups, group]);
    return group;
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
    const expanded = new Set(keywords);
    const groups = this.synonyms();
    let previousSize: number;
    do {
      previousSize = expanded.size;
      for (const group of groups) {
        if (group.some((term) => expanded.has(term))) group.forEach((term) => expanded.add(term));
      }
    } while (expanded.size !== previousSize);
    const ranked = this.records().map((record) => {
      const title = normalize(record.title);
      const score = [...expanded].filter((term) => title.includes(term)).length;
      return { record, score };
    }).filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt)
        || a.record.id.localeCompare(b.record.id));
    return { keywords, expanded: [...expanded], records: ranked.slice(0, MAX_CANDIDATES).map(({ record }) => record) };
  }
}
