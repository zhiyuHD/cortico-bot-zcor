import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

interface MemoryOperation {
  id: string;
  recordedAt: string;
  kind: string;
  details: unknown;
}

interface HistoryPage {
  items: MemoryOperation[];
  total: number;
  nextOffset: number | null;
}

const copy = {
  zh: {
    title: '操作历史', search: '记忆内容、关键词或操作参数', searchAction: '搜索',
    from: '开始时间（ISO）', to: '结束时间（ISO）', time: '操作时间', operation: '操作',
    details: '详情', view: '查看', empty: '暂无操作记录', loading: '读取中…',
    page: (from: number, to: number, total: number) => `${from}-${to} / ${total}`,
    loadError: '无法读取操作历史',
    kinds: {
      create: '新增记忆', update: '更新记忆', delete: '删除记忆', important: '重要标记',
      merge: '合并记忆', supersede: '替代记忆', relationship_write: '更新人物关系',
      relationship_delete: '删除人物关系', synonyms_add: '新增同义词组',
      synonyms_update: '修改同义词组', synonyms_delete: '删除同义词组', tool: '工具调用',
    } as Record<string, string>,
  },
  en: {
    title: 'Operation history', search: 'Memory content, keyword or operation data', searchAction: 'Search',
    from: 'From (ISO)', to: 'To (ISO)', time: 'Time', operation: 'Operation',
    details: 'Details', view: 'View', empty: 'No operations', loading: 'Loading…',
    page: (from: number, to: number, total: number) => `${from}-${to} / ${total}`,
    loadError: 'Could not load operation history',
    kinds: {
      create: 'Create memory', update: 'Update memory', delete: 'Delete memory', important: 'Important mark',
      merge: 'Merge memories', supersede: 'Supersede memory', relationship_write: 'Update relationship',
      relationship_delete: 'Delete relationship', synonyms_add: 'Add synonym group',
      synonyms_update: 'Update synonym group', synonyms_delete: 'Delete synonym group', tool: 'Tool call',
    } as Record<string, string>,
  },
} as const;

export function mountHistory(ctx: WebUiPanelContext): void {
  const ui = ctx.ui;
  const S = ctx.language === 'zh' || ctx.language === 'zh-Hant' ? copy.zh : copy.en;
  const sheet = ui.sheet({ title: S.title });
  const search = ui.input({ type: 'search', placeholder: S.search, onCommit: () => { offset = 0; void load(); } });
  const from = ui.input({ placeholder: '2026-10-17T00:00:00+08:00', onCommit: () => { offset = 0; void load(); } });
  const to = ui.input({ placeholder: '2026-10-17T23:59:59+08:00', onCommit: () => { offset = 0; void load(); } });
  const filters = ui.rowbar();
  filters.append(
    ui.field(S.search, search), ui.field(S.from, from), ui.field(S.to, to),
    ui.button(S.searchAction, { size: 'sm', onClick: () => { offset = 0; void load(); } }),
  );
  const table = ui.table({ head: [S.time, S.operation, S.details] });
  const status = ui.msgline();
  const pageLine = ui.rowbar();
  const pageLabel = ui.msgline();
  const previous = ui.button('‹', { size: 'sm', onClick: () => { offset = Math.max(0, offset - pageSize); void load(); } });
  const next = ui.button('›', { size: 'sm', onClick: () => { offset += pageSize; void load(); } });
  previous.title = ctx.language === 'en' ? 'Previous page' : '上一页';
  next.title = ctx.language === 'en' ? 'Next page' : '下一页';
  pageLine.append(pageLabel, previous, next);
  sheet.body.append(filters, status, table.el, pageLine);

  const pageSize = 50;
  let offset = 0;
  let total = 0;
  const showDetails = (entry: MemoryOperation): void => {
    const body = ui.h('pre', 'mono');
    body.textContent = JSON.stringify(entry.details, null, 2);
    ui.drawer(S.details, body);
  };
  const render = (items: MemoryOperation[]): void => {
    table.clear(items.length ? undefined : S.empty);
    for (const entry of items) {
      const kind = S.kinds[entry.kind] ?? entry.kind;
      table.addRow([
        ui.fmt.clock(entry.recordedAt),
        { text: kind, cls: 'txt' },
        ui.button(S.view, { size: 'sm', onClick: () => showDetails(entry) }),
      ]);
    }
    pageLabel.textContent = S.page(total === 0 ? 0 : offset + 1, offset + items.length, total);
    previous.disabled = offset === 0;
    next.disabled = offset + items.length >= total;
  };
  async function load(): Promise<void> {
    status.textContent = S.loading;
    status.classList.remove('bad');
    try {
      const term = search.value.trim();
      const page = await ctx.invoke<HistoryPage>('query', [{
        ...(term ? { keywords: [term] } : {}),
        ...(from.value.trim() ? { from: from.value.trim() } : {}),
        ...(to.value.trim() ? { to: to.value.trim() } : {}),
        limit: pageSize, offset,
      }]);
      total = page.total;
      render(page.items);
      status.textContent = '';
    } catch (error) {
      status.textContent = `${S.loadError}: ${String(error)}`;
      status.classList.add('bad');
    }
  }

  ctx.root.append(sheet.el);
  void load();
}
