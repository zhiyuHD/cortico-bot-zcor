import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  parentId: string | null;
  sourceMessage?: string;
  createdAt: string;
  updatedAt: string;
  supersededBy?: string;
  important: boolean;
}

interface MemoryPage {
  items: MemoryRecord[];
  total: number;
  nextOffset: number | null;
}

interface ImportantResult {
  reminder: string | null;
}

const copy = {
  zh: {
    title: '记忆', search: '标题、正文或关键词', searchAction: '搜索', add: '新增记忆',
    includeSuperseded: '包含已替代记忆', from: '开始时间（ISO）', to: '结束时间（ISO）',
    parent: '父节点', root: '根节点', sourceMessage: '原始消息', path: '节点路径', children: '子节点',
    updated: '更新时间', keywords: '关键词', status: '状态', actions: '操作',
    important: '重要', superseded: '已替代', view: '查看', edit: '编辑', remove: '删除',
    mark: '设为重要', unmark: '取消重要', empty: '暂无记忆', loading: '读取中…',
    createTitle: '新增记忆', editTitle: '编辑记忆', memoryTitle: '标题', content: '正文',
    keywordsField: '关键词', save: '保存', cancel: '取消', required: '标题和正文不能为空。',
    saved: '记忆已保存', deleted: '记忆已删除', marked: '重要标记已更新',
    removeTitle: '删除记忆', removeBody: (title: string) => `删除「${title}」？操作历史会保留删除前内容。`,
    page: (from: number, to: number, total: number) => `${from}-${to} / ${total}`,
    loadError: '无法读取记忆', saveError: '无法保存记忆', deleteError: '无法删除记忆', importantError: '无法更新重要标记',
    supersededBy: (id: string) => `替代目标：${id}`,
  },
  en: {
    title: 'Memories', search: 'Title, content or keyword', searchAction: 'Search', add: 'Add memory',
    includeSuperseded: 'Include superseded memories', from: 'From (ISO)', to: 'To (ISO)',
    parent: 'Parent node', root: 'Root node', sourceMessage: 'Source message', path: 'Node path', children: 'Children',
    updated: 'Updated', keywords: 'Keywords', status: 'Status', actions: 'Actions',
    important: 'Important', superseded: 'Superseded', view: 'View', edit: 'Edit', remove: 'Delete',
    mark: 'Mark important', unmark: 'Unmark important', empty: 'No memories', loading: 'Loading…',
    createTitle: 'Add memory', editTitle: 'Edit memory', memoryTitle: 'Title', content: 'Content',
    keywordsField: 'Keywords', save: 'Save', cancel: 'Cancel', required: 'Title and content are required.',
    saved: 'Memory saved', deleted: 'Memory deleted', marked: 'Important mark updated',
    removeTitle: 'Delete memory', removeBody: (title: string) => `Delete ${title}? The operation history will retain its previous content.`,
    page: (from: number, to: number, total: number) => `${from}-${to} / ${total}`,
    loadError: 'Could not load memories', saveError: 'Could not save memory', deleteError: 'Could not delete memory', importantError: 'Could not update important mark',
    supersededBy: (id: string) => `Replacement: ${id}`,
  },
} as const;

export function mountMemories(ctx: WebUiPanelContext): void {
  const ui = ctx.ui;
  const S = ctx.language === 'zh' || ctx.language === 'zh-Hant' ? copy.zh : copy.en;
  const listSheet = ui.sheet({ title: S.title });
  const search = ui.input({ type: 'search', placeholder: S.search, onCommit: () => { offset = 0; void load(); } });
  const from = ui.input({ placeholder: '2026-10-17T00:00:00+08:00', onCommit: () => { offset = 0; void load(); } });
  const to = ui.input({ placeholder: '2026-10-17T23:59:59+08:00', onCommit: () => { offset = 0; void load(); } });
  const includeSuperseded = ui.checkbox(S.includeSuperseded, { onChange: () => { offset = 0; void load(); } });
  const filters = ui.rowbar();
  filters.append(
    ui.field(S.search, search), ui.field(S.from, from), ui.field(S.to, to),
    includeSuperseded.el,
    ui.button(S.searchAction, { size: 'sm', onClick: () => { offset = 0; void load(); } }),
  );
  const table = ui.table({ head: [S.memoryTitle, S.keywords, S.status, S.updated, S.actions] });
  const status = ui.msgline();
  const pageLine = ui.rowbar();
  const pageLabel = ui.msgline();
  const previous = ui.button('‹', { size: 'sm', onClick: () => { offset = Math.max(0, offset - pageSize); void load(); } });
  const next = ui.button('›', { size: 'sm', onClick: () => { offset += pageSize; void load(); } });
  previous.title = ctx.language === 'en' ? 'Previous page' : '上一页';
  next.title = ctx.language === 'en' ? 'Next page' : '下一页';
  pageLine.append(pageLabel, previous, next);
  listSheet.body.append(filters, status, table.el, pageLine);

  const editor = ui.sheet({ title: S.createTitle });
  editor.el.hidden = true;
  const title = ui.input();
  const content = ui.textarea({ rows: 8 });
  const keywords = ui.input({ placeholder: ctx.language === 'en' ? 'Separate with commas' : '用逗号分隔' });
  const parentId = ui.select({ options: [{ value: '', label: S.root }] });
  const sourceMessage = ui.textarea({ rows: 5 });
  const editorStatus = ui.msgline();
  const actions = ui.actions();
  const save = ui.button(S.save, { variant: 'primary', onClick: () => { void saveRecord(); } });
  actions.append(save, ui.button(S.cancel, { onClick: () => { editor.el.hidden = true; } }));
  editor.body.append(
    ui.field(S.memoryTitle, title), ui.field(S.content, content), ui.field(S.keywordsField, keywords),
    ui.field(S.parent, parentId), ui.field(S.sourceMessage, sourceMessage),
    editorStatus, actions,
  );

  const pageSize = 50;
  let offset = 0;
  let total = 0;
  let editingId: string | undefined;
  const showError = (line: HTMLElement, message: string): void => {
    line.textContent = message;
    line.classList.add('bad');
  };
  const editRecord = (record?: MemoryRecord): void => {
    editingId = record?.id;
    title.value = record?.title ?? '';
    content.value = record?.content ?? '';
    keywords.value = record?.keywords.join(', ') ?? '';
    parentId.value = record?.parentId ?? '';
    sourceMessage.value = record?.sourceMessage ?? '';
    void loadNodes(record?.id);
    editorStatus.textContent = '';
    editorStatus.classList.remove('bad');
    editor.el.hidden = false;
    title.focus();
  };
  const showRecord = (record: MemoryRecord): void => {
    void ctx.invoke<{ path: MemoryRecord[]; children: MemoryRecord[] }>('trace', [record.id]).then((trace) => {
      const details = ui.h('div');
      const path = ui.h('pre', 'mono');
      path.textContent = `${S.path}\n${trace.path.map((item) => `${item.title} · ${item.id}`).join('\n')}`;
      const children = ui.h('pre', 'mono');
      children.textContent = `${S.children}\n${trace.children.map((item) => `${item.title} · ${item.id}`).join('\n') || '—'}`;
      const source = ui.h('pre', 'mono');
      source.textContent = `${S.sourceMessage}\n${record.sourceMessage ?? '—'}`;
      const content = ui.h('pre', 'mono');
      content.textContent = JSON.stringify(record, null, 2);
      details.append(path, children, source, content);
      ui.drawer(record.title, details);
    }).catch((error) => showError(status, `${S.loadError}: ${String(error)}`));
  };
  async function loadNodes(excludeId?: string): Promise<void> {
    const selected = parentId.value;
    try {
      const nodes = await ctx.invoke<Array<{ id: string; title: string; parentId: string | null }>>('nodes');
      const excluded = new Set<string>();
      if (excludeId) {
        excluded.add(excludeId);
        let changed: boolean;
        do {
          changed = false;
          for (const node of nodes) {
            if (node.parentId && excluded.has(node.parentId) && !excluded.has(node.id)) {
              excluded.add(node.id);
              changed = true;
            }
          }
        } while (changed);
      }
      const options = [{ value: '', label: S.root }, ...nodes.filter((node) => !excluded.has(node.id))
        .map((node) => ({ value: node.id, label: `${node.title} · ${node.id}` }))];
      parentId.replaceChildren(...options.map((item) => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        return option;
      }));
      parentId.value = options.some((option) => option.value === selected) ? selected : '';
    } catch (error) {
      showError(editorStatus, `${S.loadError}: ${String(error)}`);
    }
  }
  const render = (records: MemoryRecord[]): void => {
    table.clear(records.length ? undefined : S.empty);
    for (const record of records) {
      const flags = ui.rowbar();
      if (record.important) flags.append(ui.chip(S.important, 'accent'));
      if (record.supersededBy) flags.append(ui.chip(S.superseded, 'warn'));
      const rowActions = ui.rowbar();
      const edit = ui.button(S.edit, { size: 'sm', onClick: () => editRecord(record) });
      edit.disabled = !!record.supersededBy;
      const important = ui.button(record.important ? S.unmark : S.mark, {
        size: 'sm', onClick: () => { void setImportant(record); },
      });
      important.disabled = !!record.supersededBy;
      rowActions.append(
        ui.button(S.view, { size: 'sm', onClick: () => showRecord(record) }),
        edit,
        important,
        ui.button(S.remove, { size: 'sm', variant: 'danger', onClick: () => { void deleteRecord(record); } }),
      );
      if (record.supersededBy) {
        const target = ui.h('span', 'muted', S.supersededBy(record.supersededBy));
        flags.append(target);
      }
      if (record.parentId) flags.append(ui.chip(S.parent));
      table.addRow([
        { text: record.title, cls: 'txt' },
        { text: record.keywords.join(', '), cls: 'txt' },
        flags,
        ui.fmt.clock(record.updatedAt),
        rowActions,
      ]);
    }
    pageLabel.textContent = S.page(total === 0 ? 0 : offset + 1, offset + records.length, total);
    previous.disabled = offset === 0;
    next.disabled = offset + records.length >= total;
  };
  async function load(): Promise<void> {
    status.textContent = S.loading;
    status.classList.remove('bad');
    try {
      const term = search.value.trim();
      const page = await ctx.invoke<MemoryPage>('query', [{
        ...(term ? { keywords: [term] } : {}),
        ...(from.value.trim() ? { from: from.value.trim() } : {}),
        ...(to.value.trim() ? { to: to.value.trim() } : {}),
        limit: pageSize, offset, includeSuperseded: includeSuperseded.checked,
      }]);
      total = page.total;
      render(page.items);
      status.textContent = '';
    } catch (error) {
      showError(status, `${S.loadError}: ${String(error)}`);
    }
  }
  async function saveRecord(): Promise<void> {
    if (!title.value.trim() || !content.value.trim()) {
      showError(editorStatus, S.required);
      return;
    }
    const disabled = ui.disable(save);
    try {
      const parent = parentId.value;
      await ctx.invoke('write', [{
        title: title.value.trim(), content: content.value.trim(),
        ...(editingId ? { id: editingId } : {}),
        keywords: keywords.value.split(/[,，、;；\n]/).map((entry) => entry.trim()).filter(Boolean),
        parentId: parent || null,
        ...(sourceMessage.value.trim() ? { sourceMessage: sourceMessage.value } : { sourceMessage: null }),
      }]);
      editor.el.hidden = true;
      ui.toast(S.saved, 'ok');
      await load();
    } catch (error) {
      showError(editorStatus, `${S.saveError}: ${String(error)}`);
    } finally {
      disabled.dispose();
    }
  }
  async function setImportant(record: MemoryRecord): Promise<void> {
    try {
      const result = await ctx.invoke<ImportantResult>('important', [{ id: record.id, important: !record.important }]);
      await load();
      if (result.reminder) status.textContent = result.reminder;
      else ui.toast(S.marked, 'ok');
    } catch (error) {
      showError(status, `${S.importantError}: ${String(error)}`);
    }
  }
  async function deleteRecord(record: MemoryRecord): Promise<void> {
    if (!await ui.confirm({ title: S.removeTitle, body: S.removeBody(record.title), danger: true })) return;
    try {
      await ctx.invoke('delete', [record.id]);
      ui.toast(S.deleted, 'ok');
      await load();
    } catch (error) {
      showError(status, `${S.deleteError}: ${String(error)}`);
    }
  }

  const header = ui.rowbar();
  header.append(ui.button(S.add, { variant: 'primary', size: 'sm', onClick: () => editRecord() }));
  listSheet.body.prepend(header);
  ctx.root.append(listSheet.el, editor.el);
  void load();
}
