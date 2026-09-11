/**
 * 翻译调度器：去重、并发限流、指数退避重试、缓存短路。
 *
 * 只依赖注入的缓存与翻译客户端两个端口，不依赖任何浏览器 API。
 */

import type { PersistedTranslation, TranslationEntry } from '../cache/translation-cache';
import {
  AiTranslationError,
  type TranslateRequest,
  type TranslateResult,
} from '../translator/ai-client';

export interface CachePort {
  get(text: string, targetLang: string): Promise<PersistedTranslation | undefined>;
  set(text: string, targetLang: string, entry: TranslationEntry): Promise<void>;
}

export interface TranslationClientPort {
  translate(request: TranslateRequest): Promise<TranslateResult>;
}

export interface SchedulerOptions {
  cache: CachePort;
  client: TranslationClientPort;
  concurrency?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  /** 注入以便测试跳过真实等待 */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;

/** 只有网络抖动与限流/服务端错误值得重试；4xx 与格式错误重试没有意义 */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof AiTranslationError)) {
    return false;
  }
  if (error.kind === 'network') {
    return true;
  }
  if (error.kind === 'http') {
    return error.status === 429 || (error.status ?? 0) >= 500;
  }
  return false;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class TranslationScheduler {
  private readonly cache: CachePort;
  private readonly client: TranslationClientPort;
  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  private readonly inflight = new Map<string, Promise<TranslateResult>>();
  private readonly waiting: Array<() => void> = [];
  private active = 0;

  constructor(options: SchedulerOptions) {
    this.cache = options.cache;
    this.client = options.client;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async translate(text: string, targetLang: string): Promise<TranslateResult> {
    const cached = await this.cache.get(text, targetLang);
    if (cached !== undefined) {
      return { translated: cached.translated, sourceLang: cached.sourceLang };
    }

    const key = `${targetLang}:${text}`;
    const existing = this.inflight.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const task = this.runWithRetry(text, targetLang);
    this.inflight.set(key, task);

    try {
      return await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async runWithRetry(text: string, targetLang: string): Promise<TranslateResult> {
    return this.withSlot(async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        if (attempt > 0) {
          await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
        }

        try {
          const result = await this.client.translate({ text, targetLang });
          await this.cache.set(text, targetLang, {
            translated: result.translated,
            sourceLang: result.sourceLang,
          });
          return result;
        } catch (error) {
          lastError = error;
          if (!isRetryable(error) || attempt === this.maxRetries) {
            break;
          }
        }
      }

      throw lastError;
    });
  }

  /** 简单的并发闸门：占满时排队，释放时放行下一个 */
  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
