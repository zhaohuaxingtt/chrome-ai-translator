/**
 * OpenAI 兼容的翻译客户端。
 *
 * 网络能力通过 fetchImpl 注入，因此本模块不直接依赖 fetch，
 * 测试中用替身即可完整覆盖请求构造与各类失败分支。
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AiClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  fetchImpl: FetchLike;
}

export interface TranslateRequest {
  text: string;
  targetLang: string;
}

export interface TranslateResult {
  translated: string;
  /** 源语言由模型自动识别，不要求它回传具体语种 */
  sourceLang: string;
}

export type AiErrorKind = 'network' | 'http' | 'format';

/** 可区分的错误类型，供调度器决定是重试还是降级 */
export class AiTranslationError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;

  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'AiTranslationError';
    this.kind = kind;
    this.status = status;
  }
}

const DEFAULT_TEMPERATURE = 0.3;
const AUTO_SOURCE_LANG = 'auto';

function buildSystemPrompt(targetLang: string): string {
  return [
    '你是翻译引擎。',
    `把用户给出的网页文本翻译成 ${targetLang}。`,
    '只输出译文本身：不要解释、不要加引号、不要附带原文。',
    '保留原文的换行与段落结构。',
  ].join('\n');
}

/** 从未知结构的响应里安全取出首条译文 */
function extractContent(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const message = (choices[0] as { message?: unknown } | undefined)?.message;
  if (typeof message !== 'object' || message === null) {
    return undefined;
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : undefined;
}

export class AiTranslationClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: AiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.fetchImpl = config.fetchImpl;
  }

  async translate(request: TranslateRequest): Promise<TranslateResult> {
    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const payload = {
      model: this.model,
      temperature: this.temperature,
      messages: [
        { role: 'system', content: buildSystemPrompt(request.targetLang) },
        { role: 'user', content: request.text },
      ],
    };

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new AiTranslationError('network', `翻译请求发送失败：${detail}`);
    }

    if (!response.ok) {
      throw new AiTranslationError(
        'http',
        `翻译服务返回 ${response.status}`,
        response.status,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AiTranslationError('format', '翻译服务返回的不是合法 JSON');
    }

    const content = extractContent(data);
    if (content === undefined) {
      throw new AiTranslationError('format', '翻译服务响应中缺少译文内容');
    }

    return { translated: content.trim(), sourceLang: AUTO_SOURCE_LANG };
  }
}
