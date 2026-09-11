/**
 * 翻译缓存：内存 LRU 热缓存 + 注入的持久化存储。
 *
 * 本模块不依赖任何浏览器 API——持久化能力通过 CacheStoragePort 注入，
 * 生产环境接 IndexedDB，测试环境接内存实现。
 */

export interface PersistedTranslation {
  translated: string;
  sourceLang: string;
  timestamp: number;
}

export type TranslationEntry = Omit<PersistedTranslation, 'timestamp'>;

/** 持久化存储的注入端口 */
export interface CacheStoragePort {
  get(key: string): Promise<PersistedTranslation | undefined>;
  set(key: string, value: PersistedTranslation): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface TranslationCacheOptions {
  storage: CacheStoragePort;
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 1000;

/**
 * 键 = 目标语言 + 原文。
 * 这里刻意用原文而非摘要：hash 碰撞会让缓存返回错误译文，
 * 而这种错误极难排查，故正确性优先于键长度（IndexedDB 完全支持长键）。
 */
export function buildCacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text}`;
}

export class TranslationCache {
  private readonly storage: CacheStoragePort;
  private readonly maxEntries: number;
  private readonly memory = new Map<string, PersistedTranslation>();

  constructor(options: TranslationCacheOptions) {
    this.storage = options.storage;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /** 读取译文：先查内存，未命中再回落到持久化层并回填内存 */
  async get(text: string, targetLang: string): Promise<PersistedTranslation | undefined> {
    const key = buildCacheKey(text, targetLang);

    const fromMemory = this.memory.get(key);
    if (fromMemory !== undefined) {
      this.touch(key, fromMemory);
      return fromMemory;
    }

    const fromStorage = await this.storage.get(key);
    if (fromStorage !== undefined) {
      this.touch(key, fromStorage);
      return fromStorage;
    }

    return undefined;
  }

  async set(text: string, targetLang: string, entry: TranslationEntry): Promise<void> {
    const key = buildCacheKey(text, targetLang);
    const value: PersistedTranslation = { ...entry, timestamp: Date.now() };

    this.touch(key, value);
    await this.storage.set(key, value);
  }

  async clear(): Promise<void> {
    this.memory.clear();
    await this.storage.clear();
  }

  /** 写入或刷新内存条目（移到最新），超出容量时淘汰最少使用的 */
  private touch(key: string, value: PersistedTranslation): void {
    this.memory.delete(key);
    this.memory.set(key, value);

    while (this.memory.size > this.maxEntries) {
      const oldest = this.memory.keys().next();
      if (oldest.done) {
        break;
      }
      this.memory.delete(oldest.value);
    }
  }
}
