import { describe, expect, it } from 'vitest';
import { handleTranslateRequest } from '../src/background/translate-handler';
import {
  TranslationCache,
  type CacheStoragePort,
  type PersistedTranslation,
} from '../src/core/cache/translation-cache';
import { TranslationScheduler } from '../src/core/scheduler/translation-scheduler';
import {
  AiTranslationError,
  type TranslateResult,
} from '../src/core/translator/ai-client';

class MemoryStorage implements CacheStoragePort {
  private store = new Map<string, PersistedTranslation>();

  async get(key: string): Promise<PersistedTranslation | undefined> {
    return this.store.get(key);
  }

  async set(key: string, value: PersistedTranslation): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

const ok = (translated: string): TranslateResult => ({ translated, sourceLang: 'auto' });

describe('翻译请求处理器', () => {
  it('把每个块的译文与源语言一并返回', async () => {
    const response = await handleTranslateRequest(
      { blocks: [{ id: 'b1', text: 'Hello' }], targetLang: 'zh' },
      { translate: async () => ok('你好') },
    );

    expect(response.results).toEqual([{ id: 'b1', translated: '你好', sourceLang: 'auto' }]);
    expect(response.errors).toEqual([]);
  });

  it('一次处理多个块，保持与请求一致的顺序', async () => {
    const response = await handleTranslateRequest(
      {
        blocks: [
          { id: 'b1', text: 'One' },
          { id: 'b2', text: 'Two' },
        ],
        targetLang: 'zh',
      },
      { translate: async () => ok('译') },
    );

    expect(response.results.map((r) => r.id)).toEqual(['b1', 'b2']);
  });

  it('单个块失败时记入 errors，其余块照常返回', async () => {
    const response = await handleTranslateRequest(
      {
        blocks: [
          { id: 'b1', text: 'Good' },
          { id: 'b2', text: 'Bad' },
        ],
        targetLang: 'zh',
      },
      {
        translate: async (_text: string) => {
          if (_text === 'Bad') {
            throw new AiTranslationError('http', '配额不足', 429);
          }
          return ok('好');
        },
      },
    );

    expect(response.results).toEqual([{ id: 'b1', translated: '好', sourceLang: 'auto' }]);
    expect(response.errors).toEqual([
      { id: 'b2', message: '配额不足', kind: 'http', status: 429 },
    ]);
  });

  it('未知异常也不会中断整批处理', async () => {
    const response = await handleTranslateRequest(
      { blocks: [{ id: 'b1', text: 'x' }], targetLang: 'zh' },
      {
        translate: async () => {
          throw new Error('boom');
        },
      },
    );

    expect(response.results).toEqual([]);
    expect(response.errors[0]).toMatchObject({ id: 'b1', kind: 'unknown' });
  });

  it('命中缓存时不调用 AI（与缓存、调度器集成）', async () => {
    const cache = new TranslationCache({ storage: new MemoryStorage() });
    let calls = 0;
    const scheduler = new TranslationScheduler({
      cache,
      client: {
        translate: async () => {
          calls += 1;
          return ok('你好');
        },
      },
      sleep: async () => {},
    });

    const payload = { blocks: [{ id: 'b1', text: 'Hello' }], targetLang: 'zh' };
    const deps = { translate: (t: string, l: string) => scheduler.translate(t, l) };

    await handleTranslateRequest(payload, deps);
    await handleTranslateRequest(payload, deps);

    expect(calls).toBe(1); // 第二次命中缓存
  });
});
