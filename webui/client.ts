import type { WebUiClientBundle, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

interface RelationshipRecord {
  personId: string;
  name: string;
  aliases: string[];
  relationship: string;
  affinity: number;
  reason: string;
  updatedAt: string;
}

interface RelationshipPage {
  items: RelationshipRecord[];
  total: number;
  nextOffset: number | null;
}

const copy = {
  zh: {
    title: '人物关系', search: '姓名、别名、关系或依据', searchAction: '搜索', add: '新增关系',
    id: '人物 ID', name: '姓名', aliases: '别名', relationship: '关系', affinity: '好感度',
    reason: '判断依据', save: '保存', cancel: '取消', edit: '编辑', remove: '删除',
    updated: '更新时间', actions: '操作', empty: '暂无关系记录', loading: '读取中…',
    createTitle: '新增人物关系', editTitle: '编辑人物关系', saved: '关系已保存', deleted: '关系已删除',
    removeTitle: '删除人物关系', removeBody: (name: string) => `删除「${name}」的关系记录？操作历史会保留。`,
    required: '请填写人物 ID、姓名、关系和判断依据。', affinityRange: '好感度需在 -100 到 100 之间。',
    page: (from: number, to: number, total: number) => `${from}-${to} / ${total}`,
    loadError: '无法读取关系记录', saveError: '无法保存关系记录', deleteError: '无法删除关系记录',
  },
  en: {
    title: 'Relationships', search: 'Name, alias, relationship or reason', searchAction: 'Search', add: 'Add relationship',
    id: 'Person ID', name: 'Name', aliases: 'Aliases', relationship: 'Relationship', affinity: 'Affinity',
    reason: 'Reason', save: 'Save', cancel: 'Cancel', edit: 'Edit', remove: 'Delete',
    updated: 'Updated', actions: 'Actions', empty: 'No relationship records', loading: 'Loading…',
    createTitle: 'Add relationship', editTitle: 'Edit relationship', saved: 'Relationship saved', deleted: 'Relationship deleted',
    removeTitle: 'Delete relationship', removeBody: (name: string) => `Delete the relationship for ${name}? The operation history will be retained.`,
    required: 'Person ID, name, relationship and reason are required.', affinityRange: 'Affinity must be between -100 and 100.',
    page: (from: number, to: number, total: number) => `${from}-${to} / ${total}`,
    loadError: 'Could not load relationships', saveError: 'Could not save relationship', deleteError: 'Could not delete relationship',
  },
} as const;

function mountRelationships(ctx: WebUiPanelContext): void {
  const ui = ctx.ui;
  const S = ctx.language === 'zh' || ctx.language === 'zh-Hant' ? copy.zh : copy.en;
  const listSheet = ui.sheet({ title: S.title });
  const search = ui.input({ type: 'search', placeholder: S.search, onCommit: () => { offset = 0; void load(); } });
  const searchBar = ui.rowbar();
  searchBar.append(ui.field(S.search, search), ui.button(S.searchAction, {
    size: 'sm', onClick: () => { offset = 0; void load(); },
  }));

  const table = ui.table({ head: [S.name, S.relationship, S.affinity, S.updated, S.actions] });
  const status = ui.msgline();
  const pageLine = ui.rowbar();
  const pageLabel = ui.msgline();
  const previous = ui.button('‹', { size: 'sm', onClick: () => { offset = Math.max(0, offset - 100); void load(); } });
  const next = ui.button('›', { size: 'sm', onClick: () => { offset += 100; void load(); } });
  previous.title = ctx.language === 'en' ? 'Previous page' : '上一页';
  next.title = ctx.language === 'en' ? 'Next page' : '下一页';
  pageLine.append(pageLabel, previous, next);
  listSheet.body.append(searchBar, status, table.el, pageLine);

  const editor = ui.sheet({ title: ctx.language === 'en' ? 'Relationship record' : '人物关系记录' });
  editor.el.hidden = true;
  const personId = ui.input({ placeholder: 'qq:user:123' });
  const name = ui.input();
  const aliases = ui.input({ placeholder: ctx.language === 'en' ? 'Separate with commas' : '用逗号分隔' });
  const relationship = ui.input();
  const affinity = ui.input({ type: 'number', value: '0' });
  affinity.min = '-100';
  affinity.max = '100';
  affinity.step = '1';
  const reason = ui.textarea({ rows: 3 });
  const editorStatus = ui.msgline();
  const formActions = ui.actions();
  const save = ui.button(S.save, { variant: 'primary', onClick: () => { void saveRecord(); } });
  formActions.append(save, ui.button(S.cancel, { onClick: () => { editor.el.hidden = true; } }));
  editor.body.append(
    ui.field(S.id, personId), ui.field(S.name, name), ui.field(S.aliases, aliases),
    ui.field(S.relationship, relationship), ui.field(S.affinity, affinity), ui.field(S.reason, reason),
    editorStatus, formActions,
  );

  let offset = 0;
  let total = 0;
  const showError = (line: HTMLElement, message: string): void => {
    line.textContent = message;
    line.classList.add('bad');
  };
  const editRecord = (record?: RelationshipRecord): void => {
    personId.value = record?.personId ?? '';
    personId.disabled = !!record;
    name.value = record?.name ?? '';
    aliases.value = record?.aliases.join(', ') ?? '';
    relationship.value = record?.relationship ?? '';
    affinity.value = String(record?.affinity ?? 0);
    reason.value = record?.reason ?? '';
    editorStatus.textContent = '';
    editorStatus.classList.remove('bad');
    editor.el.hidden = false;
    name.focus();
  };
  const render = (records: RelationshipRecord[]): void => {
    table.clear(records.length ? undefined : S.empty);
    for (const record of records) {
      const actions = ui.rowbar();
      actions.append(
        ui.button(S.edit, { size: 'sm', onClick: () => editRecord(record) }),
        ui.button(S.remove, { size: 'sm', variant: 'danger', onClick: () => { void deleteRecord(record); } }),
      );
      const tone = record.affinity > 0 ? 'accent' : record.affinity < 0 ? 'warn' : 'plain';
      table.addRow([
        { text: record.name, cls: 'txt' },
        { text: record.relationship, cls: 'txt' },
        ui.chip(String(record.affinity), tone),
        ui.fmt.clock(record.updatedAt),
        actions,
      ]);
    }
    const first = total === 0 ? 0 : offset + 1;
    pageLabel.textContent = S.page(first, offset + records.length, total);
    previous.disabled = offset === 0;
    next.disabled = offset + records.length >= total;
  };
  async function load(): Promise<void> {
    status.textContent = S.loading;
    status.classList.remove('bad');
    try {
      const term = search.value.trim();
      const page = await ctx.invoke<RelationshipPage>('query', [{
        ...(term ? { keywords: [term] } : {}), limit: 100, offset,
      }]);
      total = page.total;
      render(page.items);
      status.textContent = '';
    } catch (error) {
      showError(status, `${S.loadError}: ${String(error)}`);
    }
  }
  async function saveRecord(): Promise<void> {
    const value = Number(affinity.value);
    if (!personId.value.trim() || !name.value.trim() || !relationship.value.trim() || !reason.value.trim()) {
      showError(editorStatus, S.required);
      return;
    }
    if (!Number.isFinite(value) || value < -100 || value > 100) {
      showError(editorStatus, S.affinityRange);
      return;
    }
    const disabled = ui.disable(save);
    try {
      await ctx.invoke('write', [{
        personId: personId.value.trim(), name: name.value.trim(),
        aliases: aliases.value.split(/[,，、\n]/).map((entry) => entry.trim()).filter(Boolean),
        relationship: relationship.value.trim(), affinity: value, reason: reason.value.trim(),
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
  async function deleteRecord(record: RelationshipRecord): Promise<void> {
    if (!await ui.confirm({ title: S.removeTitle, body: S.removeBody(record.name), danger: true })) return;
    try {
      await ctx.invoke('delete', [record.personId]);
      ui.toast(S.deleted, 'ok');
      await load();
    } catch (error) {
      showError(status, `${S.deleteError}: ${String(error)}`);
    }
  }

  const add = ui.button(S.add, { variant: 'primary', size: 'sm', onClick: () => editRecord() });
  const header = ui.rowbar();
  header.append(add);
  listSheet.body.prepend(header);
  ctx.root.append(listSheet.el, editor.el);
  void load();
}

const bundle: WebUiClientBundle = {
  panels: { relationships: { mount: mountRelationships } },
};

export default bundle;
