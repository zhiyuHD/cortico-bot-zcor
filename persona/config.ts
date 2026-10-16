import type { ConfigGroup, CoreConfig } from 'cortico/core/types.ts';

export const ZCOR_DEFAULTS = { autoRecall: { maxChars: 6000 }, relationship: { enabled: true } };

export interface ZcorConfig extends CoreConfig {
  autoRecall: { maxChars: number };
  relationship: { enabled: boolean };
}

export const ZCOR_CONFIG_GROUP: ConfigGroup = {
  id: 'zcor-memory',
  owner: 'persona',
  schema: {
    type: 'object', title: 'zcor Memory',
    properties: {
      'autoRecall.maxChars': {
        type: 'integer', title: '自动回忆字符预算', minimum: 0, maximum: 100_000,
        'x-hot': true, 'x-suffix': '字符',
        description: '限制自动回忆消息的总长度，包含标题、ID 和正文片段。0 关闭自动回忆上下文；完整记忆可用工具读取。',
      },
      'relationship.enabled': {
        type: 'boolean', title: '启用人物关系记忆', 'x-hot': true,
        description: '允许 AI 查询、创建和更新人物关系，并在 system prompt 中提供关系维护指引。Memory 页始终可以管理已有记录。',
      },
    },
  },
};
