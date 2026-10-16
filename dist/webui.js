// webui/client.ts
var copy = {
  zh: {
    title: "\u4EBA\u7269\u5173\u7CFB",
    search: "\u59D3\u540D\u3001\u522B\u540D\u3001\u5173\u7CFB\u6216\u4F9D\u636E",
    searchAction: "\u641C\u7D22",
    add: "\u65B0\u589E\u5173\u7CFB",
    id: "\u4EBA\u7269 ID",
    name: "\u59D3\u540D",
    aliases: "\u522B\u540D",
    relationship: "\u5173\u7CFB",
    affinity: "\u597D\u611F\u5EA6",
    reason: "\u5224\u65AD\u4F9D\u636E",
    save: "\u4FDD\u5B58",
    cancel: "\u53D6\u6D88",
    edit: "\u7F16\u8F91",
    remove: "\u5220\u9664",
    updated: "\u66F4\u65B0\u65F6\u95F4",
    actions: "\u64CD\u4F5C",
    empty: "\u6682\u65E0\u5173\u7CFB\u8BB0\u5F55",
    loading: "\u8BFB\u53D6\u4E2D\u2026",
    createTitle: "\u65B0\u589E\u4EBA\u7269\u5173\u7CFB",
    editTitle: "\u7F16\u8F91\u4EBA\u7269\u5173\u7CFB",
    saved: "\u5173\u7CFB\u5DF2\u4FDD\u5B58",
    deleted: "\u5173\u7CFB\u5DF2\u5220\u9664",
    removeTitle: "\u5220\u9664\u4EBA\u7269\u5173\u7CFB",
    removeBody: (name) => `\u5220\u9664\u300C${name}\u300D\u7684\u5173\u7CFB\u8BB0\u5F55\uFF1F\u64CD\u4F5C\u5386\u53F2\u4F1A\u4FDD\u7559\u3002`,
    required: "\u8BF7\u586B\u5199\u4EBA\u7269 ID\u3001\u59D3\u540D\u3001\u5173\u7CFB\u548C\u5224\u65AD\u4F9D\u636E\u3002",
    affinityRange: "\u597D\u611F\u5EA6\u9700\u5728 -100 \u5230 100 \u4E4B\u95F4\u3002",
    page: (from, to, total) => `${from}-${to} / ${total}`,
    loadError: "\u65E0\u6CD5\u8BFB\u53D6\u5173\u7CFB\u8BB0\u5F55",
    saveError: "\u65E0\u6CD5\u4FDD\u5B58\u5173\u7CFB\u8BB0\u5F55",
    deleteError: "\u65E0\u6CD5\u5220\u9664\u5173\u7CFB\u8BB0\u5F55"
  },
  en: {
    title: "Relationships",
    search: "Name, alias, relationship or reason",
    searchAction: "Search",
    add: "Add relationship",
    id: "Person ID",
    name: "Name",
    aliases: "Aliases",
    relationship: "Relationship",
    affinity: "Affinity",
    reason: "Reason",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    updated: "Updated",
    actions: "Actions",
    empty: "No relationship records",
    loading: "Loading\u2026",
    createTitle: "Add relationship",
    editTitle: "Edit relationship",
    saved: "Relationship saved",
    deleted: "Relationship deleted",
    removeTitle: "Delete relationship",
    removeBody: (name) => `Delete the relationship for ${name}? The operation history will be retained.`,
    required: "Person ID, name, relationship and reason are required.",
    affinityRange: "Affinity must be between -100 and 100.",
    page: (from, to, total) => `${from}-${to} / ${total}`,
    loadError: "Could not load relationships",
    saveError: "Could not save relationship",
    deleteError: "Could not delete relationship"
  }
};
function mountRelationships(ctx) {
  const ui = ctx.ui;
  const S = ctx.language === "zh" || ctx.language === "zh-Hant" ? copy.zh : copy.en;
  const listSheet = ui.sheet({ title: S.title });
  const search = ui.input({ type: "search", placeholder: S.search, onCommit: () => {
    offset = 0;
    void load();
  } });
  const searchBar = ui.rowbar();
  searchBar.append(ui.field(S.search, search), ui.button(S.searchAction, {
    size: "sm",
    onClick: () => {
      offset = 0;
      void load();
    }
  }));
  const table = ui.table({ head: [S.name, S.relationship, S.affinity, S.updated, S.actions] });
  const status = ui.msgline();
  const pageLine = ui.rowbar();
  const pageLabel = ui.msgline();
  const previous = ui.button("\u2039", { size: "sm", onClick: () => {
    offset = Math.max(0, offset - 100);
    void load();
  } });
  const next = ui.button("\u203A", { size: "sm", onClick: () => {
    offset += 100;
    void load();
  } });
  previous.title = ctx.language === "en" ? "Previous page" : "\u4E0A\u4E00\u9875";
  next.title = ctx.language === "en" ? "Next page" : "\u4E0B\u4E00\u9875";
  pageLine.append(pageLabel, previous, next);
  listSheet.body.append(searchBar, status, table.el, pageLine);
  const editor = ui.sheet({ title: ctx.language === "en" ? "Relationship record" : "\u4EBA\u7269\u5173\u7CFB\u8BB0\u5F55" });
  editor.el.hidden = true;
  const personId = ui.input({ placeholder: "qq:user:123" });
  const name = ui.input();
  const aliases = ui.input({ placeholder: ctx.language === "en" ? "Separate with commas" : "\u7528\u9017\u53F7\u5206\u9694" });
  const relationship = ui.input();
  const affinity = ui.input({ type: "number", value: "0" });
  affinity.min = "-100";
  affinity.max = "100";
  affinity.step = "1";
  const reason = ui.textarea({ rows: 3 });
  const editorStatus = ui.msgline();
  const formActions = ui.actions();
  const save = ui.button(S.save, { variant: "primary", onClick: () => {
    void saveRecord();
  } });
  formActions.append(save, ui.button(S.cancel, { onClick: () => {
    editor.el.hidden = true;
  } }));
  editor.body.append(
    ui.field(S.id, personId),
    ui.field(S.name, name),
    ui.field(S.aliases, aliases),
    ui.field(S.relationship, relationship),
    ui.field(S.affinity, affinity),
    ui.field(S.reason, reason),
    editorStatus,
    formActions
  );
  let offset = 0;
  let total = 0;
  const showError = (line, message) => {
    line.textContent = message;
    line.classList.add("bad");
  };
  const editRecord = (record) => {
    personId.value = record?.personId ?? "";
    personId.disabled = !!record;
    name.value = record?.name ?? "";
    aliases.value = record?.aliases.join(", ") ?? "";
    relationship.value = record?.relationship ?? "";
    affinity.value = String(record?.affinity ?? 0);
    reason.value = record?.reason ?? "";
    editorStatus.textContent = "";
    editorStatus.classList.remove("bad");
    editor.el.hidden = false;
    name.focus();
  };
  const render = (records) => {
    table.clear(records.length ? void 0 : S.empty);
    for (const record of records) {
      const actions = ui.rowbar();
      actions.append(
        ui.button(S.edit, { size: "sm", onClick: () => editRecord(record) }),
        ui.button(S.remove, { size: "sm", variant: "danger", onClick: () => {
          void deleteRecord(record);
        } })
      );
      const tone = record.affinity > 0 ? "accent" : record.affinity < 0 ? "warn" : "plain";
      table.addRow([
        { text: record.name, cls: "txt" },
        { text: record.relationship, cls: "txt" },
        ui.chip(String(record.affinity), tone),
        ui.fmt.clock(record.updatedAt),
        actions
      ]);
    }
    const first = total === 0 ? 0 : offset + 1;
    pageLabel.textContent = S.page(first, offset + records.length, total);
    previous.disabled = offset === 0;
    next.disabled = offset + records.length >= total;
  };
  async function load() {
    status.textContent = S.loading;
    status.classList.remove("bad");
    try {
      const term = search.value.trim();
      const page = await ctx.invoke("query", [{
        ...term ? { keywords: [term] } : {},
        limit: 100,
        offset
      }]);
      total = page.total;
      render(page.items);
      status.textContent = "";
    } catch (error) {
      showError(status, `${S.loadError}: ${String(error)}`);
    }
  }
  async function saveRecord() {
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
      await ctx.invoke("write", [{
        personId: personId.value.trim(),
        name: name.value.trim(),
        aliases: aliases.value.split(/[,，、\n]/).map((entry) => entry.trim()).filter(Boolean),
        relationship: relationship.value.trim(),
        affinity: value,
        reason: reason.value.trim()
      }]);
      editor.el.hidden = true;
      ui.toast(S.saved, "ok");
      await load();
    } catch (error) {
      showError(editorStatus, `${S.saveError}: ${String(error)}`);
    } finally {
      disabled.dispose();
    }
  }
  async function deleteRecord(record) {
    if (!await ui.confirm({ title: S.removeTitle, body: S.removeBody(record.name), danger: true })) return;
    try {
      await ctx.invoke("delete", [record.personId]);
      ui.toast(S.deleted, "ok");
      await load();
    } catch (error) {
      showError(status, `${S.deleteError}: ${String(error)}`);
    }
  }
  const add = ui.button(S.add, { variant: "primary", size: "sm", onClick: () => editRecord() });
  const header = ui.rowbar();
  header.append(add);
  listSheet.body.prepend(header);
  ctx.root.append(listSheet.el, editor.el);
  void load();
}
var bundle = {
  panels: { relationships: { mount: mountRelationships } }
};
var client_default = bundle;
export {
  client_default as default
};
