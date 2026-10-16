// webui/history.ts
var copy = {
  zh: {
    title: "\u64CD\u4F5C\u5386\u53F2",
    search: "\u8BB0\u5FC6\u5185\u5BB9\u3001\u5173\u952E\u8BCD\u6216\u64CD\u4F5C\u53C2\u6570",
    searchAction: "\u641C\u7D22",
    from: "\u5F00\u59CB\u65F6\u95F4\uFF08ISO\uFF09",
    to: "\u7ED3\u675F\u65F6\u95F4\uFF08ISO\uFF09",
    time: "\u64CD\u4F5C\u65F6\u95F4",
    operation: "\u64CD\u4F5C",
    details: "\u8BE6\u60C5",
    view: "\u67E5\u770B",
    empty: "\u6682\u65E0\u64CD\u4F5C\u8BB0\u5F55",
    loading: "\u8BFB\u53D6\u4E2D\u2026",
    page: (from, to, total) => `${from}-${to} / ${total}`,
    loadError: "\u65E0\u6CD5\u8BFB\u53D6\u64CD\u4F5C\u5386\u53F2",
    kinds: {
      create: "\u65B0\u589E\u8BB0\u5FC6",
      update: "\u66F4\u65B0\u8BB0\u5FC6",
      delete: "\u5220\u9664\u8BB0\u5FC6",
      important: "\u91CD\u8981\u6807\u8BB0",
      merge: "\u5408\u5E76\u8BB0\u5FC6",
      supersede: "\u66FF\u4EE3\u8BB0\u5FC6",
      relationship_write: "\u66F4\u65B0\u4EBA\u7269\u5173\u7CFB",
      relationship_delete: "\u5220\u9664\u4EBA\u7269\u5173\u7CFB",
      synonyms_add: "\u65B0\u589E\u540C\u4E49\u8BCD\u7EC4",
      synonyms_update: "\u4FEE\u6539\u540C\u4E49\u8BCD\u7EC4",
      synonyms_delete: "\u5220\u9664\u540C\u4E49\u8BCD\u7EC4",
      tool: "\u5DE5\u5177\u8C03\u7528"
    }
  },
  en: {
    title: "Operation history",
    search: "Memory content, keyword or operation data",
    searchAction: "Search",
    from: "From (ISO)",
    to: "To (ISO)",
    time: "Time",
    operation: "Operation",
    details: "Details",
    view: "View",
    empty: "No operations",
    loading: "Loading\u2026",
    page: (from, to, total) => `${from}-${to} / ${total}`,
    loadError: "Could not load operation history",
    kinds: {
      create: "Create memory",
      update: "Update memory",
      delete: "Delete memory",
      important: "Important mark",
      merge: "Merge memories",
      supersede: "Supersede memory",
      relationship_write: "Update relationship",
      relationship_delete: "Delete relationship",
      synonyms_add: "Add synonym group",
      synonyms_update: "Update synonym group",
      synonyms_delete: "Delete synonym group",
      tool: "Tool call"
    }
  }
};
function mountHistory(ctx) {
  const ui = ctx.ui;
  const S = ctx.language === "zh" || ctx.language === "zh-Hant" ? copy.zh : copy.en;
  const sheet = ui.sheet({ title: S.title });
  const search = ui.input({ type: "search", placeholder: S.search, onCommit: () => {
    offset = 0;
    void load();
  } });
  const from = ui.input({ placeholder: "2026-10-17T00:00:00+08:00", onCommit: () => {
    offset = 0;
    void load();
  } });
  const to = ui.input({ placeholder: "2026-10-17T23:59:59+08:00", onCommit: () => {
    offset = 0;
    void load();
  } });
  const filters = ui.rowbar();
  filters.append(
    ui.field(S.search, search),
    ui.field(S.from, from),
    ui.field(S.to, to),
    ui.button(S.searchAction, { size: "sm", onClick: () => {
      offset = 0;
      void load();
    } })
  );
  const table = ui.table({ head: [S.time, S.operation, S.details] });
  const status = ui.msgline();
  const pageLine = ui.rowbar();
  const pageLabel = ui.msgline();
  const previous = ui.button("\u2039", { size: "sm", onClick: () => {
    offset = Math.max(0, offset - pageSize);
    void load();
  } });
  const next = ui.button("\u203A", { size: "sm", onClick: () => {
    offset += pageSize;
    void load();
  } });
  previous.title = ctx.language === "en" ? "Previous page" : "\u4E0A\u4E00\u9875";
  next.title = ctx.language === "en" ? "Next page" : "\u4E0B\u4E00\u9875";
  pageLine.append(pageLabel, previous, next);
  sheet.body.append(filters, status, table.el, pageLine);
  const pageSize = 50;
  let offset = 0;
  let total = 0;
  const showDetails = (entry) => {
    const body = ui.h("pre", "mono");
    body.textContent = JSON.stringify(entry.details, null, 2);
    ui.drawer(S.details, body);
  };
  const render = (items) => {
    table.clear(items.length ? void 0 : S.empty);
    for (const entry of items) {
      const kind = S.kinds[entry.kind] ?? entry.kind;
      table.addRow([
        ui.fmt.clock(entry.recordedAt),
        { text: kind, cls: "txt" },
        ui.button(S.view, { size: "sm", onClick: () => showDetails(entry) })
      ]);
    }
    pageLabel.textContent = S.page(total === 0 ? 0 : offset + 1, offset + items.length, total);
    previous.disabled = offset === 0;
    next.disabled = offset + items.length >= total;
  };
  async function load() {
    status.textContent = S.loading;
    status.classList.remove("bad");
    try {
      const term = search.value.trim();
      const page = await ctx.invoke("query", [{
        ...term ? { keywords: [term] } : {},
        ...from.value.trim() ? { from: from.value.trim() } : {},
        ...to.value.trim() ? { to: to.value.trim() } : {},
        limit: pageSize,
        offset
      }]);
      total = page.total;
      render(page.items);
      status.textContent = "";
    } catch (error) {
      status.textContent = `${S.loadError}: ${String(error)}`;
      status.classList.add("bad");
    }
  }
  ctx.root.append(sheet.el);
  void load();
}

// webui/memories.ts
var copy2 = {
  zh: {
    title: "\u8BB0\u5FC6",
    search: "\u6807\u9898\u3001\u6B63\u6587\u6216\u5173\u952E\u8BCD",
    searchAction: "\u641C\u7D22",
    add: "\u65B0\u589E\u8BB0\u5FC6",
    includeSuperseded: "\u5305\u542B\u5DF2\u66FF\u4EE3\u8BB0\u5FC6",
    from: "\u5F00\u59CB\u65F6\u95F4\uFF08ISO\uFF09",
    to: "\u7ED3\u675F\u65F6\u95F4\uFF08ISO\uFF09",
    parent: "\u7236\u8282\u70B9",
    root: "\u6839\u8282\u70B9",
    sourceMessage: "\u539F\u59CB\u6D88\u606F",
    path: "\u8282\u70B9\u8DEF\u5F84",
    children: "\u5B50\u8282\u70B9",
    updated: "\u66F4\u65B0\u65F6\u95F4",
    keywords: "\u5173\u952E\u8BCD",
    status: "\u72B6\u6001",
    actions: "\u64CD\u4F5C",
    important: "\u91CD\u8981",
    superseded: "\u5DF2\u66FF\u4EE3",
    view: "\u67E5\u770B",
    edit: "\u7F16\u8F91",
    remove: "\u5220\u9664",
    mark: "\u8BBE\u4E3A\u91CD\u8981",
    unmark: "\u53D6\u6D88\u91CD\u8981",
    empty: "\u6682\u65E0\u8BB0\u5FC6",
    loading: "\u8BFB\u53D6\u4E2D\u2026",
    createTitle: "\u65B0\u589E\u8BB0\u5FC6",
    editTitle: "\u7F16\u8F91\u8BB0\u5FC6",
    memoryTitle: "\u6807\u9898",
    content: "\u6B63\u6587",
    keywordsField: "\u5173\u952E\u8BCD",
    save: "\u4FDD\u5B58",
    cancel: "\u53D6\u6D88",
    required: "\u6807\u9898\u548C\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A\u3002",
    saved: "\u8BB0\u5FC6\u5DF2\u4FDD\u5B58",
    deleted: "\u8BB0\u5FC6\u5DF2\u5220\u9664",
    marked: "\u91CD\u8981\u6807\u8BB0\u5DF2\u66F4\u65B0",
    removeTitle: "\u5220\u9664\u8BB0\u5FC6",
    removeBody: (title) => `\u5220\u9664\u300C${title}\u300D\uFF1F\u64CD\u4F5C\u5386\u53F2\u4F1A\u4FDD\u7559\u5220\u9664\u524D\u5185\u5BB9\u3002`,
    page: (from, to, total) => `${from}-${to} / ${total}`,
    loadError: "\u65E0\u6CD5\u8BFB\u53D6\u8BB0\u5FC6",
    saveError: "\u65E0\u6CD5\u4FDD\u5B58\u8BB0\u5FC6",
    deleteError: "\u65E0\u6CD5\u5220\u9664\u8BB0\u5FC6",
    importantError: "\u65E0\u6CD5\u66F4\u65B0\u91CD\u8981\u6807\u8BB0",
    supersededBy: (id) => `\u66FF\u4EE3\u76EE\u6807\uFF1A${id}`
  },
  en: {
    title: "Memories",
    search: "Title, content or keyword",
    searchAction: "Search",
    add: "Add memory",
    includeSuperseded: "Include superseded memories",
    from: "From (ISO)",
    to: "To (ISO)",
    parent: "Parent node",
    root: "Root node",
    sourceMessage: "Source message",
    path: "Node path",
    children: "Children",
    updated: "Updated",
    keywords: "Keywords",
    status: "Status",
    actions: "Actions",
    important: "Important",
    superseded: "Superseded",
    view: "View",
    edit: "Edit",
    remove: "Delete",
    mark: "Mark important",
    unmark: "Unmark important",
    empty: "No memories",
    loading: "Loading\u2026",
    createTitle: "Add memory",
    editTitle: "Edit memory",
    memoryTitle: "Title",
    content: "Content",
    keywordsField: "Keywords",
    save: "Save",
    cancel: "Cancel",
    required: "Title and content are required.",
    saved: "Memory saved",
    deleted: "Memory deleted",
    marked: "Important mark updated",
    removeTitle: "Delete memory",
    removeBody: (title) => `Delete ${title}? The operation history will retain its previous content.`,
    page: (from, to, total) => `${from}-${to} / ${total}`,
    loadError: "Could not load memories",
    saveError: "Could not save memory",
    deleteError: "Could not delete memory",
    importantError: "Could not update important mark",
    supersededBy: (id) => `Replacement: ${id}`
  }
};
function mountMemories(ctx) {
  const ui = ctx.ui;
  const S = ctx.language === "zh" || ctx.language === "zh-Hant" ? copy2.zh : copy2.en;
  const listSheet = ui.sheet({ title: S.title });
  const search = ui.input({ type: "search", placeholder: S.search, onCommit: () => {
    offset = 0;
    void load();
  } });
  const from = ui.input({ placeholder: "2026-10-17T00:00:00+08:00", onCommit: () => {
    offset = 0;
    void load();
  } });
  const to = ui.input({ placeholder: "2026-10-17T23:59:59+08:00", onCommit: () => {
    offset = 0;
    void load();
  } });
  const includeSuperseded = ui.checkbox(S.includeSuperseded, { onChange: () => {
    offset = 0;
    void load();
  } });
  const filters = ui.rowbar();
  filters.append(
    ui.field(S.search, search),
    ui.field(S.from, from),
    ui.field(S.to, to),
    includeSuperseded.el,
    ui.button(S.searchAction, { size: "sm", onClick: () => {
      offset = 0;
      void load();
    } })
  );
  const table = ui.table({ head: [S.memoryTitle, S.keywords, S.status, S.updated, S.actions] });
  const status = ui.msgline();
  const pageLine = ui.rowbar();
  const pageLabel = ui.msgline();
  const previous = ui.button("\u2039", { size: "sm", onClick: () => {
    offset = Math.max(0, offset - pageSize);
    void load();
  } });
  const next = ui.button("\u203A", { size: "sm", onClick: () => {
    offset += pageSize;
    void load();
  } });
  previous.title = ctx.language === "en" ? "Previous page" : "\u4E0A\u4E00\u9875";
  next.title = ctx.language === "en" ? "Next page" : "\u4E0B\u4E00\u9875";
  pageLine.append(pageLabel, previous, next);
  listSheet.body.append(filters, status, table.el, pageLine);
  const editor = ui.sheet({ title: S.createTitle });
  editor.el.hidden = true;
  const title = ui.input();
  const content = ui.textarea({ rows: 8 });
  const keywords = ui.input({ placeholder: ctx.language === "en" ? "Separate with commas" : "\u7528\u9017\u53F7\u5206\u9694" });
  const parentId = ui.select({ options: [{ value: "", label: S.root }] });
  const sourceMessage = ui.textarea({ rows: 5 });
  const editorStatus = ui.msgline();
  const actions = ui.actions();
  const save = ui.button(S.save, { variant: "primary", onClick: () => {
    void saveRecord();
  } });
  actions.append(save, ui.button(S.cancel, { onClick: () => {
    editor.el.hidden = true;
  } }));
  editor.body.append(
    ui.field(S.memoryTitle, title),
    ui.field(S.content, content),
    ui.field(S.keywordsField, keywords),
    ui.field(S.parent, parentId),
    ui.field(S.sourceMessage, sourceMessage),
    editorStatus,
    actions
  );
  const pageSize = 50;
  let offset = 0;
  let total = 0;
  let editingId;
  const showError = (line, message) => {
    line.textContent = message;
    line.classList.add("bad");
  };
  const editRecord = (record) => {
    editingId = record?.id;
    title.value = record?.title ?? "";
    content.value = record?.content ?? "";
    keywords.value = record?.keywords.join(", ") ?? "";
    parentId.value = record?.parentId ?? "";
    sourceMessage.value = record?.sourceMessage ?? "";
    void loadNodes(record?.id);
    editorStatus.textContent = "";
    editorStatus.classList.remove("bad");
    editor.el.hidden = false;
    title.focus();
  };
  const showRecord = (record) => {
    void ctx.invoke("trace", [record.id]).then((trace) => {
      const details = ui.h("div");
      const path = ui.h("pre", "mono");
      path.textContent = `${S.path}
${trace.path.map((item) => `${item.title} \xB7 ${item.id}`).join("\n")}`;
      const children = ui.h("pre", "mono");
      children.textContent = `${S.children}
${trace.children.map((item) => `${item.title} \xB7 ${item.id}`).join("\n") || "\u2014"}`;
      const source = ui.h("pre", "mono");
      source.textContent = `${S.sourceMessage}
${record.sourceMessage ?? "\u2014"}`;
      const content2 = ui.h("pre", "mono");
      content2.textContent = JSON.stringify(record, null, 2);
      details.append(path, children, source, content2);
      ui.drawer(record.title, details);
    }).catch((error) => showError(status, `${S.loadError}: ${String(error)}`));
  };
  async function loadNodes(excludeId) {
    const selected = parentId.value;
    try {
      const nodes = await ctx.invoke("nodes");
      const excluded = /* @__PURE__ */ new Set();
      if (excludeId) {
        excluded.add(excludeId);
        let changed;
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
      const options = [{ value: "", label: S.root }, ...nodes.filter((node) => !excluded.has(node.id)).map((node) => ({ value: node.id, label: `${node.title} \xB7 ${node.id}` }))];
      parentId.replaceChildren(...options.map((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        return option;
      }));
      parentId.value = options.some((option) => option.value === selected) ? selected : "";
    } catch (error) {
      showError(editorStatus, `${S.loadError}: ${String(error)}`);
    }
  }
  const render = (records) => {
    table.clear(records.length ? void 0 : S.empty);
    for (const record of records) {
      const flags = ui.rowbar();
      if (record.important) flags.append(ui.chip(S.important, "accent"));
      if (record.supersededBy) flags.append(ui.chip(S.superseded, "warn"));
      const rowActions = ui.rowbar();
      const edit = ui.button(S.edit, { size: "sm", onClick: () => editRecord(record) });
      edit.disabled = !!record.supersededBy;
      const important = ui.button(record.important ? S.unmark : S.mark, {
        size: "sm",
        onClick: () => {
          void setImportant(record);
        }
      });
      important.disabled = !!record.supersededBy;
      rowActions.append(
        ui.button(S.view, { size: "sm", onClick: () => showRecord(record) }),
        edit,
        important,
        ui.button(S.remove, { size: "sm", variant: "danger", onClick: () => {
          void deleteRecord(record);
        } })
      );
      if (record.supersededBy) {
        const target = ui.h("span", "muted", S.supersededBy(record.supersededBy));
        flags.append(target);
      }
      if (record.parentId) flags.append(ui.chip(S.parent));
      table.addRow([
        { text: record.title, cls: "txt" },
        { text: record.keywords.join(", "), cls: "txt" },
        flags,
        ui.fmt.clock(record.updatedAt),
        rowActions
      ]);
    }
    pageLabel.textContent = S.page(total === 0 ? 0 : offset + 1, offset + records.length, total);
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
        ...from.value.trim() ? { from: from.value.trim() } : {},
        ...to.value.trim() ? { to: to.value.trim() } : {},
        limit: pageSize,
        offset,
        includeSuperseded: includeSuperseded.checked
      }]);
      total = page.total;
      render(page.items);
      status.textContent = "";
    } catch (error) {
      showError(status, `${S.loadError}: ${String(error)}`);
    }
  }
  async function saveRecord() {
    if (!title.value.trim() || !content.value.trim()) {
      showError(editorStatus, S.required);
      return;
    }
    const disabled = ui.disable(save);
    try {
      const parent = parentId.value;
      await ctx.invoke("write", [{
        title: title.value.trim(),
        content: content.value.trim(),
        ...editingId ? { id: editingId } : {},
        keywords: keywords.value.split(/[,，、;；\n]/).map((entry) => entry.trim()).filter(Boolean),
        parentId: parent || null,
        ...sourceMessage.value.trim() ? { sourceMessage: sourceMessage.value } : { sourceMessage: null }
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
  async function setImportant(record) {
    try {
      const result = await ctx.invoke("important", [{ id: record.id, important: !record.important }]);
      await load();
      if (result.reminder) status.textContent = result.reminder;
      else ui.toast(S.marked, "ok");
    } catch (error) {
      showError(status, `${S.importantError}: ${String(error)}`);
    }
  }
  async function deleteRecord(record) {
    if (!await ui.confirm({ title: S.removeTitle, body: S.removeBody(record.title), danger: true })) return;
    try {
      await ctx.invoke("delete", [record.id]);
      ui.toast(S.deleted, "ok");
      await load();
    } catch (error) {
      showError(status, `${S.deleteError}: ${String(error)}`);
    }
  }
  const header = ui.rowbar();
  header.append(ui.button(S.add, { variant: "primary", size: "sm", onClick: () => editRecord() }));
  listSheet.body.prepend(header);
  ctx.root.append(listSheet.el, editor.el);
  void load();
}

// webui/synonyms.ts
var copy3 = {
  zh: {
    title: "\u540C\u4E49\u8BCD\u5E93",
    search: "\u7B5B\u9009\u8BCD\u7EC4",
    group: "\u540C\u4E49\u8BCD\u7EC4",
    actions: "\u64CD\u4F5C",
    add: "\u65B0\u589E\u8BCD\u7EC4",
    terms: "\u8BCD\u8BED",
    termsHint: "\u7528\u9017\u53F7\u6216\u6362\u884C\u5206\u9694",
    edit: "\u7F16\u8F91",
    remove: "\u5220\u9664",
    save: "\u4FDD\u5B58",
    cancel: "\u53D6\u6D88",
    empty: "\u6682\u65E0\u540C\u4E49\u8BCD\u7EC4",
    required: "\u81F3\u5C11\u9700\u8981\u4E24\u4E2A\u4E0D\u540C\u7684\u8BCD\u3002",
    saved: "\u540C\u4E49\u8BCD\u7EC4\u5DF2\u4FDD\u5B58",
    deleted: "\u540C\u4E49\u8BCD\u7EC4\u5DF2\u5220\u9664",
    deleteTitle: "\u5220\u9664\u540C\u4E49\u8BCD\u7EC4",
    deleteBody: (terms) => `\u5220\u9664\u300C${terms.join("\u3001")}\u300D\uFF1F\u540E\u7EED\u68C0\u7D22\u5C06\u4E0D\u518D\u6269\u5C55\u8FD9\u4E9B\u8BCD\u3002`,
    preview: "\u68C0\u7D22\u9884\u89C8",
    previewHint: "\u8F93\u5165\u5173\u952E\u8BCD\uFF0C\u4EE5\u9017\u53F7\u5206\u9694",
    previewAction: "\u9884\u89C8\u6269\u5C55",
    expanded: "\u6269\u5C55\u7ED3\u679C",
    previewRequired: "\u8BF7\u8F93\u5165\u81F3\u5C11\u4E00\u4E2A\u5173\u952E\u8BCD\u3002",
    previewError: "\u65E0\u6CD5\u751F\u6210\u9884\u89C8",
    loadError: "\u65E0\u6CD5\u8BFB\u53D6\u540C\u4E49\u8BCD\u5E93",
    saveError: "\u65E0\u6CD5\u4FDD\u5B58\u540C\u4E49\u8BCD\u7EC4",
    deleteError: "\u65E0\u6CD5\u5220\u9664\u540C\u4E49\u8BCD\u7EC4"
  },
  en: {
    title: "Synonyms",
    search: "Filter groups",
    group: "Synonym group",
    actions: "Actions",
    add: "Add group",
    terms: "Terms",
    termsHint: "Separate with commas or new lines",
    edit: "Edit",
    remove: "Delete",
    save: "Save",
    cancel: "Cancel",
    empty: "No synonym groups",
    required: "Enter at least two distinct terms.",
    saved: "Synonym group saved",
    deleted: "Synonym group deleted",
    deleteTitle: "Delete synonym group",
    deleteBody: (terms) => `Delete ${terms.join(", ")}? Future searches will stop expanding these terms.`,
    preview: "Search preview",
    previewHint: "Enter keywords separated by commas",
    previewAction: "Preview expansion",
    expanded: "Expanded terms",
    previewRequired: "Enter at least one keyword.",
    previewError: "Could not preview expansion",
    loadError: "Could not load synonyms",
    saveError: "Could not save synonym group",
    deleteError: "Could not delete synonym group"
  }
};
function parseTerms(value) {
  return value.split(/[,，、;；\n]/).map((term) => term.trim()).filter(Boolean);
}
function mountSynonyms(ctx) {
  const ui = ctx.ui;
  const S = ctx.language === "zh" || ctx.language === "zh-Hant" ? copy3.zh : copy3.en;
  const sheet = ui.sheet({ title: S.title });
  const filter = ui.input({ type: "search", placeholder: S.search, onCommit: () => {
    render();
  } });
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
  const save = ui.button(S.save, { variant: "primary", onClick: () => {
    void saveGroup();
  } });
  editorActions.append(save, ui.button(S.cancel, { onClick: () => {
    editor.el.hidden = true;
  } }));
  editor.body.append(ui.field(S.terms, terms), editorStatus, editorActions);
  const previewSheet = ui.sheet({ title: S.preview });
  const previewInput = ui.input({ type: "search", placeholder: S.previewHint });
  const previewResult = ui.msgline();
  const previewActions = ui.rowbar();
  previewActions.append(ui.field(S.terms, previewInput), ui.button(S.previewAction, {
    size: "sm",
    onClick: () => {
      void preview();
    }
  }));
  previewSheet.body.append(previewActions, previewResult);
  let groups = [];
  let editing;
  const showError = (line, message) => {
    line.textContent = message;
    line.classList.add("bad");
  };
  const render = () => {
    const needle = filter.value.trim().normalize("NFKC").toLocaleLowerCase("und");
    const visible = groups.filter((group) => !needle || group.some((term) => term.normalize("NFKC").toLocaleLowerCase("und").includes(needle)));
    table.clear(visible.length ? void 0 : S.empty);
    for (const group of visible) {
      const actions = ui.rowbar();
      actions.append(
        ui.button(S.edit, { size: "sm", onClick: () => editGroup(group) }),
        ui.button(S.remove, { size: "sm", variant: "danger", onClick: () => {
          void deleteGroup(group);
        } })
      );
      table.addRow([{ text: group.join(", "), cls: "txt" }, actions]);
    }
  };
  const load = async () => {
    status.textContent = "";
    status.classList.remove("bad");
    try {
      groups = await ctx.invoke("query");
      render();
    } catch (error) {
      showError(status, `${S.loadError}: ${String(error)}`);
    }
  };
  const editGroup = (group) => {
    editing = group;
    terms.value = group?.join("\n") ?? "";
    editorStatus.textContent = "";
    editorStatus.classList.remove("bad");
    editor.el.hidden = false;
    terms.focus();
  };
  async function saveGroup() {
    const next = parseTerms(terms.value);
    if (new Set(next.map((term) => term.normalize("NFKC").toLocaleLowerCase("und"))).size < 2) {
      showError(editorStatus, S.required);
      return;
    }
    const disabled = ui.disable(save);
    try {
      if (editing) await ctx.invoke("update", [{ before: editing, terms: next }]);
      else await ctx.invoke("add", [{ terms: next }]);
      editor.el.hidden = true;
      ui.toast(S.saved, "ok");
      await load();
    } catch (error) {
      showError(editorStatus, `${S.saveError}: ${String(error)}`);
    } finally {
      disabled.dispose();
    }
  }
  async function deleteGroup(group) {
    if (!await ui.confirm({ title: S.deleteTitle, body: S.deleteBody(group), danger: true })) return;
    try {
      await ctx.invoke("delete", [group]);
      ui.toast(S.deleted, "ok");
      await load();
    } catch (error) {
      showError(status, `${S.deleteError}: ${String(error)}`);
    }
  }
  async function preview() {
    const keywords = parseTerms(previewInput.value);
    if (!keywords.length) {
      showError(previewResult, S.previewRequired);
      return;
    }
    previewResult.textContent = "";
    previewResult.classList.remove("bad");
    try {
      const result = await ctx.invoke("preview", [{ keywords }]);
      previewResult.textContent = `${S.expanded}: ${result.expanded.join(", ")}`;
    } catch (error) {
      showError(previewResult, `${S.previewError}: ${String(error)}`);
    }
  }
  const header = ui.rowbar();
  header.append(ui.button(S.add, { variant: "primary", size: "sm", onClick: () => editGroup() }));
  sheet.body.prepend(header);
  ctx.root.append(sheet.el, editor.el, previewSheet.el);
  void load();
}

// webui/client.ts
var copy4 = {
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
    memoryNode: "\u4EBA\u7269\u8282\u70B9",
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
    memoryNode: "Person node",
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
  const S = ctx.language === "zh" || ctx.language === "zh-Hant" ? copy4.zh : copy4.en;
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
  const memoryNode = ui.select({ options: [{ value: "", label: ctx.language === "en" ? "No linked node" : "\u672A\u5173\u8054\u8282\u70B9" }] });
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
    ui.field(S.memoryNode, memoryNode),
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
    memoryNode.value = record?.memoryNodeId ?? "";
    affinity.value = String(record?.affinity ?? 0);
    reason.value = record?.reason ?? "";
    editorStatus.textContent = "";
    editorStatus.classList.remove("bad");
    editor.el.hidden = false;
    name.focus();
    void loadMemoryNodes();
  };
  async function loadMemoryNodes() {
    try {
      const nodes = await ctx.invoke("nodes");
      const selected = memoryNode.value;
      const options = [
        { value: "", label: ctx.language === "en" ? "No linked node" : "\u672A\u5173\u8054\u8282\u70B9" },
        ...nodes.map((node) => ({ value: node.id, label: `${node.title} \xB7 ${node.id}` }))
      ];
      memoryNode.replaceChildren(...options.map((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        return option;
      }));
      memoryNode.value = options.some((item) => item.value === selected) ? selected : "";
    } catch (error) {
      showError(editorStatus, `${S.saveError}: ${String(error)}`);
    }
  }
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
        memoryNodeId: memoryNode.value || null,
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
  void loadMemoryNodes();
  void load();
}
var bundle = {
  panels: {
    memories: { mount: mountMemories },
    history: { mount: mountHistory },
    relationships: { mount: mountRelationships },
    synonyms: { mount: mountSynonyms }
  }
};
var client_default = bundle;
export {
  client_default as default
};
