import type { WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';

const copy = {
  zh: {
    title: '同义词库', search: '筛选词组', group: '同义词组', actions: '操作', add: '新增词组',
    terms: '词语', termsHint: '用逗号或换行分隔', edit: '编辑', remove: '删除', save: '保存', cancel: '取消',
    empty: '暂无同义词组', required: '至少需要两个不同的词。', saved: '同义词组已保存', deleted: '同义词组已删除',
    deleteTitle: '删除同义词组', deleteBody: (terms: string[]) => `删除「${terms.join('、')}」？后续检索将不再扩展这些词。`,
    preview: '检索预览', previewHint: '输入关键词，以逗号分隔', previewAction: '预览扩展', expanded: '扩展结果',
    previewRequired: '请输入至少一个关键词。', previewError: '无法生成预览', loadError: '无法读取同义词库',
    saveError: '无法保存同义词组', deleteError: '无法删除同义词组',
  },
  en: {
    title: 'Synonyms', search: 'Filter groups', group: 'Synonym group', actions: 'Actions', add: 'Add group',
    terms: 'Terms', termsHint: 'Separate with commas or new lines', edit: 'Edit', remove: 'Delete', save: 'Save', cancel: 'Cancel',
    empty: 'No synonym groups', required: 'Enter at least two distinct terms.', saved: 'Synonym group saved', deleted: 'Synonym group deleted',
    deleteTitle: 'Delete synonym group', deleteBody: (terms: string[]) => `Delete ${terms.join(', ')}? Future searches will stop expanding these terms.`,
    preview: 'Search preview', previewHint: 'Enter keywords separated by commas', previewAction: 'Preview expansion', expanded: 'Expanded terms',
    previewRequired: 'Enter at least one keyword.', previewError: 'Could not preview expansion', loadError: 'Could not load synonyms',
    saveError: 'Could not save synonym group', deleteError: 'Could not delete synonym group',
  },
} as const;

function parseTerms(value: string): string[] {
  return value.split(/[,，、;；\n]/).map((term) => term.trim()).filter(Boolean);
}

export function mountSynonyms(ctx: WebUiPanelContext): void {
  const ui = ctx.ui;
  const S = ctx.language === 'zh' || ctx.language === 'zh-Hant' ? copy.zh : copy.en;
  const sheet = ui.sheet({ title: S.title });
  const filter = ui.input({ type: 'search', placeholder: S.search, onCommit: () => { render(); } });
  const table = ui.table({ head: [S.group, S.actions] });
  const status = ui.msgline();
  const searchBar = ui.rowbar();
  searchBar.append(ui.field(S.search, filter));
  sheet.body.append(searchBar, status, table.el);

  const editor = ui.sheet({ title: S.add });
  editor.el.hidden = true;
  const terms = ui.textarea({ rows: 4, placeholder: S.termsHint });
  const editorStatus = ui.msgline();
  const editorActions = ui.actions();
  const save = ui.button(S.save, { variant: 'primary', onClick: () => { void saveGroup(); } });
  editorActions.append(save, ui.button(S.cancel, { onClick: () => { editor.el.hidden = true; } }));
  editor.body.append(ui.field(S.terms, terms), editorStatus, editorActions);

  const previewSheet = ui.sheet({ title: S.preview });
  const previewInput = ui.input({ type: 'search', placeholder: S.previewHint });
  const previewResult = ui.msgline();
  const previewActions = ui.rowbar();
  previewActions.append(ui.field(S.terms, previewInput), ui.button(S.previewAction, {
    size: 'sm', onClick: () => { void preview(); },
  }));
  previewSheet.body.append(previewActions, previewResult);

  let groups: string[][] = [];
  let editing: string[] | undefined;
  const showError = (line: HTMLElement, message: string): void => {
    line.textContent = message;
    line.classList.add('bad');
  };
  const render = (): void => {
    const needle = filter.value.trim().normalize('NFKC').toLocaleLowerCase('und');
    const visible = groups.filter((group) => !needle || group.some((term) =>
      term.normalize('NFKC').toLocaleLowerCase('und').includes(needle)));
    table.clear(visible.length ? undefined : S.empty);
    for (const group of visible) {
      const actions = ui.rowbar();
      actions.append(
        ui.button(S.edit, { size: 'sm', onClick: () => editGroup(group) }),
        ui.button(S.remove, { size: 'sm', variant: 'danger', onClick: () => { void deleteGroup(group); } }),
      );
      table.addRow([{ text: group.join(', '), cls: 'txt' }, actions]);
    }
  };
  const load = async (): Promise<void> => {
    status.textContent = '';
    status.classList.remove('bad');
    try {
      groups = await ctx.invoke<string[][]>('query');
      render();
    } catch (error) {
      showError(status, `${S.loadError}: ${String(error)}`);
    }
  };
  const editGroup = (group?: string[]): void => {
    editing = group;
    terms.value = group?.join('\n') ?? '';
    editorStatus.textContent = '';
    editorStatus.classList.remove('bad');
    editor.el.hidden = false;
    terms.focus();
  };
  async function saveGroup(): Promise<void> {
    const next = parseTerms(terms.value);
    if (new Set(next.map((term) => term.normalize('NFKC').toLocaleLowerCase('und'))).size < 2) {
      showError(editorStatus, S.required);
      return;
    }
    const disabled = ui.disable(save);
    try {
      if (editing) await ctx.invoke('update', [{ before: editing, terms: next }]);
      else await ctx.invoke('add', [{ terms: next }]);
      editor.el.hidden = true;
      ui.toast(S.saved, 'ok');
      await load();
    } catch (error) {
      showError(editorStatus, `${S.saveError}: ${String(error)}`);
    } finally {
      disabled.dispose();
    }
  }
  async function deleteGroup(group: string[]): Promise<void> {
    if (!await ui.confirm({ title: S.deleteTitle, body: S.deleteBody(group), danger: true })) return;
    try {
      await ctx.invoke('delete', [group]);
      ui.toast(S.deleted, 'ok');
      await load();
    } catch (error) {
      showError(status, `${S.deleteError}: ${String(error)}`);
    }
  }
  async function preview(): Promise<void> {
    const keywords = parseTerms(previewInput.value);
    if (!keywords.length) {
      showError(previewResult, S.previewRequired);
      return;
    }
    previewResult.textContent = '';
    previewResult.classList.remove('bad');
    try {
      const result = await ctx.invoke<{ expanded: string[] }>('preview', [{ keywords }]);
      previewResult.textContent = `${S.expanded}: ${result.expanded.join(', ')}`;
    } catch (error) {
      showError(previewResult, `${S.previewError}: ${String(error)}`);
    }
  }

  const header = ui.rowbar();
  header.append(ui.button(S.add, { variant: 'primary', size: 'sm', onClick: () => editGroup() }));
  sheet.body.prepend(header);
  ctx.root.append(sheet.el, editor.el, previewSheet.el);
  void load();
}
