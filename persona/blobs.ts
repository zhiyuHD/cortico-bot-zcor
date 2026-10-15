import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { BlobStore } from 'cortico/core/types.ts';
import { mimeOfHandle } from 'cortico/core/blobs.ts';

export class MemoryBlobs implements BlobStore {
  private readonly directory: string;
  constructor(memoryDir: string) {
    this.directory = join(memoryDir, 'blobs');
    mkdirSync(this.directory, { recursive: true });
  }
  put(nameHint: string, bytes: Uint8Array, _mime: string): string {
    const name = `${randomUUID()}-${basename(nameHint)}`;
    writeFileSync(join(this.directory, name), bytes);
    return `mem:blobs/${name}`;
  }
  get(handle: string): { bytes: Uint8Array; mime: string } | null {
    const name = handle.replace(/^mem:blobs\//, '');
    if (name !== basename(name) || name === '.' || name === '..') return null;
    try {
      return { bytes: readFileSync(join(this.directory, name)), mime: mimeOfHandle(name) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  list(prefix = 'blobs'): Array<{ handle: string; mime: string; size: number }> {
    return readdirSync(this.directory).flatMap((name) => {
      const path = `blobs/${name}`;
      if (!path.startsWith(prefix)) return [];
      const handle = `mem:${path}`;
      return [{ handle, mime: mimeOfHandle(name), size: readFileSync(join(this.directory, name)).length }];
    });
  }
}
