import type { BotDefinition } from 'cortico/bot.ts';
import { CORE_DEFAULTS } from 'cortico/core/config.ts';
import { ZcorPersona } from './persona/persona.ts';

export default {
  id: 'zcor',
  memoryName: 'Memory',
  declares: ['terminal'],
  defaults: () => ({
    ...structuredClone(CORE_DEFAULTS),
    displayName: 'zcor',
    paths: { memory: 'memory', data: 'data' },
  }),
  build: (loaded, worlds) => ({
    persona: new ZcorPersona(loaded.memoryDir, worlds, () => loaded.config.timezone),
  }),
} satisfies BotDefinition;
