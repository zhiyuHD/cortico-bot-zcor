import type { BotDefinition } from 'cortico/bot.ts';
import { CORE_DEFAULTS } from 'cortico/core/config.ts';
import { describeTools } from 'cortico/world.ts';
import { ZCOR_TOOL_SPECS, ZcorPersona } from './persona/persona.ts';
import { ZCOR_CONFIG_GROUP, ZCOR_DEFAULTS, type ZcorConfig } from './persona/config.ts';

export default {
  id: 'zcor',
  memoryName: 'Memory',
  declares: ['console'],
  defaults: () => ({
    ...structuredClone(CORE_DEFAULTS),
    ...structuredClone(ZCOR_DEFAULTS),
    displayName: 'zcor',
    paths: { memory: 'memory', data: 'data' },
  }),
  build: (loaded, worlds) => ({
    persona: new ZcorPersona(loaded.memoryDir, worlds, () => loaded.config.timezone,
      () => loaded.config.autoRecall.maxChars, () => loaded.config.relationship.enabled),
    webUi: { configGroups: [ZCOR_CONFIG_GROUP] },
  }),
  describe: {
    tools: describeTools(ZCOR_TOOL_SPECS, {
      zcor_memory_write: { zh: '新增或更新一条持久化 Memory。', en: 'Creates or updates a persistent memory.' },
      zcor_memory_merge: { zh: '合并多条 Memory，并将来源记录标记为已替代。', en: 'Merges memories and marks source records as superseded.' },
      zcor_memory_supersede: { zh: '将现有 Memory 标记为其他记录的旧版本。', en: 'Marks existing memories as superseded by another record.' },
      zcor_memory_read: { zh: '按 id 读取一条 Memory。', en: 'Reads one memory by id.' },
      zcor_memory_delete: { zh: '删除一条 Memory，并保留操作历史。', en: 'Deletes a memory while retaining its operation history.' },
      zcor_memory_important: { zh: '标记或取消重要 Memory。', en: 'Marks or unmarks an important memory.' },
      zcor_memory_query: { zh: '按关键词、时间范围查询当前 Memory。', en: 'Queries current memories by keywords and time range.' },
      zcor_relationship_read: { zh: '按人物 id 读取关系和好感度。', en: 'Reads a relationship and affinity by person id.' },
      zcor_relationship_query: { zh: '按人物姓名、别名和时间查找关系记录。', en: 'Finds relationship records by name, alias and time.' },
      zcor_relationship_write: { zh: '新增或更新人物关系和好感度。', en: 'Creates or updates a relationship and affinity.' },
      zcor_relationship_delete: { zh: '删除人物关系记录并保留操作历史。', en: 'Deletes a relationship while retaining operation history.' },
      zcor_memory_history: { zh: '按关键词、时间范围查询 Memory 操作历史。', en: 'Queries memory operation history by keywords and time range.' },
      zcor_memory_backup: { zh: '备份 Memory 状态。', en: 'Backs up the Memory state.' },
      zcor_memory_restore: { zh: '从备份恢复 Memory 状态。', en: 'Restores the Memory state from a backup.' },
      zcor_synonyms_add: { zh: '添加同义词组。', en: 'Adds a synonym group.' },
      zcor_memory_search: { zh: '先筛选标题候选，再由 LLM 从正文中选择相关 Memory。', en: 'Shortlists titles locally, then asks the LLM to select relevant memories from their contents.' },
      zcor_end_turn: { zh: '结束本轮。', en: 'Ends the current turn.' },
    }),
    memory: { form: { zh: '带版本、重要标记和操作历史的 JSON Memory 状态文件，附件存于 blobs/。', en: 'A versioned JSON Memory state with important marks and operation history; attachments live under blobs/.' } },
  },
} satisfies BotDefinition<ZcorConfig>;
