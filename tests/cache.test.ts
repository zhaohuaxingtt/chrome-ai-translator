import { beforeEach, describe, expect, it } from 'vitest';
import {
  TranslationCache,
  type CacheStoragePort,
  type PersistedTranslation,
} from '../src/core/cache/translation-cache';

/** 注入用的存储替身：模拟持久化层，同时暴露内部状态供断言 */
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

  get size(): number {
    return this.store.size;
  }
}

describe('翻译缓存', () => {
  let storage: MemoryStorage;
  let cache: TranslationCache;

  beforeEach(() => {
    storage = new MemoryStorage();
    cache = new TranslationCache({ storage, maxEntries: 100 });
  });

  it('写入后能命中，未写入时返回 undefined', async () => {
    await cache.set('Hello', 'zh', { translated: '你好', sourceLang: 'en' });

    const hit = await cache.get('Hello', 'zh');
    expect(hit?.translated).toBe('你好');
    expect(hit?.sourceLang).toBe('en');

    const miss = await cache.get('Goodbye', 'zh');
    expect(miss).toBeUndefined();
  });

  it('相同原文、不同目标语言互不干扰（键包含语言）', async () => {
    await cache.set('Hello', 'zh', { translated: '你好', sourceLang: 'en' });
    await cache.set('Hello', 'ja', { translated: 'こんにちは', sourceLang: 'en' });

    expect((await cache.get('Hello', 'zh'))?.translated).toBe('你好');
    expect((await cache.get('Hello', 'ja'))?.translated).toBe('こんにちは');
  });

  it('写入时同步落到持久化存储', async () => {
    await cache.set('Hello', 'zh', { translated: '你好', sourceLang: 'en' });

    expect(storage.size).toBe(1);
  });

  it('内存未命中时回落到持久化存储', async () => {
    const writer = new TranslationCache({ storage, maxEntries: 100 });
    await writer.set('Hi', 'zh', { translated: '嗨', sourceLang: 'en' });

    // 新实例内存为空，应能从持久化层读到
    const fresh = new TranslationCache({ storage, maxEntries: 100 });
    expect((await fresh.get('Hi', 'zh'))?.translated).toBe('嗨');
  });

  it('持久化命中后回填内存（移除持久化层仍可命中）', async () => {
    await cache.set('Hi', 'zh', { translated: '嗨', sourceLang: 'en' });

    const fresh = new TranslationCache({ storage, maxEntries: 100 });
    await fresh.get('Hi', 'zh'); // 触发回落 + 回填
    await storage.clear(); // 清空持久化层

    expect((await fresh.get('Hi', 'zh'))?.translated).toBe('嗨');
  });

  it('超过容量上限时淘汰最少使用的条目', async () => {
    const tiny = new TranslationCache({ storage, maxEntries: 2 });
    await tiny.set('a', 'zh', { translated: '甲', sourceLang: 'en' });
    await tiny.set('b', 'zh', { translated: '乙', sourceLang: 'en' });
    await tiny.set('c', 'zh', { translated: '丙', sourceLang: 'en' }); // 超限，a 从内存淘汰

    // 淘汰只作用于内存层，持久化层仍留副本；清空它以单独观察内存
    await storage.clear();

    expect(await tiny.get('a', 'zh')).toBeUndefined(); // a 已被淘汰
    expect((await tiny.get('b', 'zh'))?.translated).toBe('乙');
    expect((await tiny.get('c', 'zh'))?.translated).toBe('丙');
  });

  it('读取会刷新使用顺序，最近读过的不会被淘汰', async () => {
    const tiny = new TranslationCache({ storage, maxEntries: 2 });
    await tiny.set('a', 'zh', { translated: '甲', sourceLang: 'en' });
    await tiny.set('b', 'zh', { translated: '乙', sourceLang: 'en' });

    await tiny.get('a', 'zh'); // a 变为最近使用
    await tiny.set('c', 'zh', { translated: '丙', sourceLang: 'en' }); // 应淘汰 b

    await storage.clear();

    expect((await tiny.get('a', 'zh'))?.translated).toBe('甲');
    expect(await tiny.get('b', 'zh')).toBeUndefined();
  });

  it('清空会同时清掉内存与持久化存储', async () => {
    await cache.set('Hello', 'zh', { translated: '你好', sourceLang: 'en' });
    await cache.clear();

    expect(await cache.get('Hello', 'zh')).toBeUndefined();
    expect(storage.size).toBe(0);
  });
});
