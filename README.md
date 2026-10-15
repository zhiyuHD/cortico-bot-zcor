<!-- Owner: index.ts, persona/persona.ts, persona/memory.ts -->

# zcor

提供持久化 Memory 的 bot 扩展，默认启用终端 World，其他 World 由部署配置启用。

在控制台扩展页选择本机目录 `packages/cortico-bot-zcor` 安装，在部署的
`deployment.json` 中将 `bot` 设为 `cortico-bot-zcor`，重启生效。

AI 自行调用工具保存和检索记忆：

- `zcor_memory_write(title, content, id?)`：新增记忆；提供 id 时更新。
- `zcor_memory_read(id)` / `zcor_memory_delete(id)`：读取或删除当前记忆；历史保留删除前内容。
- `zcor_memory_important(id, important)`：标记或取消重要记忆。
- `zcor_memory_query(keywords?, from?, to?, limit?, offset?)`：本地查询当前记忆。
- `zcor_memory_history(keywords?, from?, to?, limit?, offset?)`：本地查询操作历史。
- `zcor_memory_backup()` / `zcor_memory_restore(backupFile)`：备份或恢复 Memory 状态。
- `zcor_synonyms_add(terms)`：添加同义词组。
- `zcor_memory_search(keywords)`：关键词数组检索。

检索对关键词和标题做 NFKC 归一化、大小写折叠。关键词通过同义词组双向、传递扩展；
标题按命中的不同扩展词数降序排列，同分按更新时间降序、id 升序排列，取最多 20 条。
将原始关键词、候选标题和全文交给当前活跃 provider 的临时 LLM session，按相关性返回最多 5 条。
无标题命中时返回空结果；LLM 可选择空结果。LLM 调用失败或返回无效 id 时返回错误。
正文不参与第一阶段匹配，因此只在正文出现的关键词可能无法召回。

新一批外部消息投递时，Persona 用本地中文分词提取至少两个字符的词，并提取消息中出现的
同义词库词条，沿同义词组扩展后按上述标题匹配规则取最多 10 条。整批消息共用这 10 条额度，
没有命中时返回空结果，不用无关记录补足。此机制是控制模型调用次数的检索 fallback，
词匹配排名不代表语义相关性。自动回忆不发起 LLM 请求，标题与正文进入主对话的临时上下文头，
会增加主对话输入 token；下一批外部消息替换结果，内部事件不触发检索。
同一条记忆只展示一次，更新后展示最新内容，删除后不再展示。结果不写入对话历史，重启后重新检索。
主动调用 `zcor_memory_search` 仍会发起 LLM 筛选请求。

重要记忆最多 5 条，按首次标记顺序排列。再次标记不改变顺序；第 6 条取消最早一条的标记，
工具回执包含被替换的 id、标题和提醒，原记忆保留。更新正文后使用最新内容，删除时同步取消标记。
每次生成 system prompt 时插入所有重要记忆；运行中的标记变更在下次生成前缀时生效。

本地查询不调用 LLM。`keywords` 是数组，全部关键词经 NFKC 和大小写归一化后作子串匹配，
不扩展同义词。当前记忆匹配标题、正文并按更新时间筛选；历史匹配整条操作记录并按操作时间筛选。
`from` 和 `to` 使用带时区的 ISO 时间，包含端点。结果按时间倒序返回 `items`、`total` 和
`nextOffset`；同一时刻按记录顺序倒序。`limit` 默认 20、最多 100，`offset` 默认 0。
查询期间新增记录可能改变分页位置。

`memory-state.json` 原子保存当前记忆、重要标记和操作历史，包含状态格式版本。首次工具操作自动载入旧
`memories.json` 的全部记录，保留原文件作迁移快照，此后以 `memory-state.json` 为准。
没有旧文件时从空记忆开始。操作历史从迁移后开始；修改保留前后全文，删除保留删除前全文，
重要标记保留替换回执。所有记忆工具调用记录参数及成功或错误状态，包括读取、查询和同义词修改；
自动召回、系统前缀读取不记操作历史。历史查询本身在结果产生后留痕。
历史随操作累积、没有自动清理；整份状态文件在写入时重写，适合单进程的小型 Memory。
同义词文件与操作日志分别保存，日志写入失败会返回“操作可能已生效”的错误。
`zcor_memory_backup` 生成带时间戳的状态副本；恢复前应先备份当前状态，恢复只接受当前版本的副本。

`synonyms.json` 保存词组，首次创建时复制包内的中文及少量英文词组。
可以通过工具补充，或直接编辑部署侧同义词文件。
文件以临时文件加重命名保存；单份 Memory 目录只供一个进程使用。附件位于 `blobs/`。
部署的身份与性格文本可放在 Memory 目录的 `PERSONA.md`，每次构造系统前缀时读取。
检索不使用向量或 embeddings 服务；主对话与筛选使用部署配置的 provider。

在仓库根运行 `pnpm check:extension packages/cortico-bot-zcor` 验证扩展接口，
运行 `pnpm exec vitest run tests/zcor` 验证持久化、同义词扩展和检索。
