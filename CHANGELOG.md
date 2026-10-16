<!-- Owner: package.json and the zcor extension package -->

## 0.5.0

- Store memories as parent-linked nodes with source messages, traversal tools and relationship links.
- Migrate Memory state versions 1 and 2 to version 3, preserving snapshots before the first write.
- Add Memory and operation history panels with keyword and time filters.
- Allow the Memory panel to edit, delete and mark records important.
- Add synonym group management and local expansion preview.

## 0.4.0

- Add settings for automatic recall and relationship memory.
- Add a Memory page panel to search, create, edit and delete relationship records.

## 0.3.0

- Add searchable memory keywords, a configurable automatic-recall character budget, and memory merge and supersede operations.
- Add person relationship and affinity records with local queries and operation history.
- Migrate Memory state version 1 to version 2; keep a `memory-state.v1.json` snapshot on the first version 2 write.

## 0.2.1

- Declare the `internal-state` market tag for the Persona-owned Memory system.

## 0.2.0

- Upgrade the bot extension contract to Cortico 0.2.0.
- Rename the default built-in World declaration from `terminal` to `console`.
- Keep structured Memory retrieval, important memories, operation history, backups and restores.
