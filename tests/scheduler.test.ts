import { beforeEach, describe, expect, it } from 'vitest';
import { AiTranslationError } from '../src/core/translator/ai-client';
import {
  TranslationScheduler,
  type CachePort,
  type TranslationClientPort,
} from '../src/core/scheduler/translation-scheduler';
import type { PersistedTranslation, TranslationEntry } from '../src/core/cache/translation-cache';
import type { TranslateResult } from '../src/core/translator/ai-client';

/** 缓存替身：只实现调度器需要的两个方法 */
class MemoryCache implements CachePort {
  private store = new Map<string, PersistedTranslation>();

  async get(text: string, targetLang: string): Promise<PersistedTranslation | undefined> {
    return this.store.get(`${targetLang}:${text}`);
  }

  async set(text: string, targetLang: string, entry: TranslationEntry): Promise<void> {
    this.store.set(`${targetLang}:${text}`, { ...entry, timestamp: Date.now() });
  }

  seed(text: string, targetLang: string, translated: string): void {
    this.store.set(`${targetLang}:${text}`, {
      translated,
      sourceLang: 'auto',
      timestamp: Date.now(),
    });
  }
}

interface Gate {
  promise: Promise<TranslateResult>;
  resolve: (value: TranslateResult) => void;
}

function deferred(): Gate {
  let resolve!: (value: TranslateResult) => void;
  const promise = new Promise<TranslateResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const ok = (translated: string): TranslateResult => ({ translated, sourceLang: 'auto' });

describe('翻译调度器', () => {
  let cache: MemoryCache;
  let delays: number[];

  beforeEach(() => {
    cache = new MemoryCache();
    delays = [];
  });

  function makeScheduler(
    client: TranslationClientPort,
    overrides: { concurrency?: number; maxRetries?: number; baseDelayMs?: number } = {},
  ): TranslationScheduler {
    return new TranslationScheduler({
      cache,
      client,
      concurrency: overrides.concurrency ?? 4,
      maxRetries: overrides.maxRetries ?? 2,
      baseDelayMs: overrides.baseDelayMs ?? 100,
      sleep: async (ms: number) => {
        delays.push(ms);
      },
    });
  }

  it('缓存命中时直接返回，不调用 API', async () => {
    cache.seed('Hello', 'zh', '你好');
    let calls = 0;
    const client: TranslationClientPort = {
      translate: async () => {
        calls += 1;
        return ok('来自接口');
      },
    };

    const result = await makeScheduler(client).translate('Hello', 'zh');

    expect(result.translated).toBe('你好');
    expect(calls).toBe(0);
  });

  it('相同原文的并发请求只调用一次 API，结果共享', async () => {
    let calls = 0;
    const gate = deferred();
    const client: TranslationClientPort = {
      translate: async () => {
        calls += 1;
        return gate.promise;
      },
    };

    const scheduler = makeScheduler(client);
    const results = Promise.all([
      scheduler.translate('Hello', 'zh'),
      scheduler.translate('Hello', 'zh'),
      scheduler.translate('Hello', 'zh'),
    ]);

    await tick();
    gate.resolve(ok('你好'));

    const all = await results;
    expect(calls).toBe(1);
    expect(all.map((r) => r.translated)).toEqual(['你好', '你好', '你好']);
  });

  it('并发上限生效，超出的排队等待', async () => {
    let calls = 0;
    const gates: Gate[] = [];
    const client: TranslationClientPort = {
      translate: async () => {
        calls += 1;
        const gate = deferred();
        gates.push(gate);
        return gate.promise;
      },
    };

    const scheduler = makeScheduler(client, { concurrency: 2 });
    const pending = ['a', 'b', 'c', 'd'].map((t) => scheduler.translate(t, 'zh'));

    await tick();
    expect(calls).toBe(2); // 只有 2 个进入，其余排队

    gates[0]?.resolve(ok('甲'));
    await tick();
    expect(calls).toBe(3); // 放行一个排队的

    gates[1]?.resolve(ok('乙'));
    gates[2]?.resolve(ok('丙'));
    await tick();
    expect(calls).toBe(4);

    gates[3]?.resolve(ok('丁'));
    await Promise.all(pending);
  });

  it('失败按指数退避重试，最终成功', async () => {
    let calls = 0;
    const client: TranslationClientPort = {
      translate: async () => {
        calls += 1;
        if (calls <= 2) {
          throw new AiTranslationError('network', '网络抖动');
        }
        return ok('你好');
      },
    };

    const result = await makeScheduler(client, { baseDelayMs: 100 }).translate('Hello', 'zh');

    expect(result.translated).toBe('你好');
    expect(calls).toBe(3);
    expect(delays).toEqual([100, 200]); // 指数退避
  });

  it('重试次数用尽后向上层报告失败', async () => {
    let calls = 0;
    const client: TranslationClientPort = {
      translate: async () => {
        calls += 1;
        throw new AiTranslationError('network', '持续失败');
      },
    };

    await expect(
      makeScheduler(client, { maxRetries: 2 }).translate('Hello', 'zh'),
    ).rejects.toMatchObject({ kind: 'network' });

    expect(calls).toBe(3); // 首次 + 2 次重试
    expect(delays).toEqual([100, 200]);
  });

  it('翻译成功后写入缓存，下次命中不再调 API', async () => {
    let calls = 0;
    const client: TranslationClientPort = {
      translate: async () => {
        calls += 1;
        return ok('你好');
      },
    };

    const scheduler = makeScheduler(client);
    await scheduler.translate('Hello', 'zh');
    await scheduler.translate('Hello', 'zh');

    expect(calls).toBe(1);
  });
});
