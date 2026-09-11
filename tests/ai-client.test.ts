import { describe, expect, it } from 'vitest';
import {
  AiTranslationClient,
  AiTranslationError,
  type AiClientConfig,
} from '../src/core/translator/ai-client';

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function setup(handler: Handler, overrides: Partial<AiClientConfig> = {}) {
  const calls: RecordedCall[] = [];

  const client = new AiTranslationClient({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    },
    ...overrides,
  });

  return { client, calls };
}

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function requestBody(call: RecordedCall | undefined): {
  model?: string;
  temperature?: number;
  messages?: Array<{ role: string; content: string }>;
} {
  return JSON.parse(String(call?.init?.body ?? '{}'));
}

describe('AI 翻译客户端', () => {
  it('按 OpenAI 兼容契约构造请求', async () => {
    const { client, calls } = setup(async () => chatResponse('你好'));

    await client.translate({ text: 'Hello', targetLang: 'zh' });

    const call = calls[0];
    expect(call?.url).toBe('https://api.example.com/v1/chat/completions');
    expect(call?.init?.method).toBe('POST');

    const headers = call?.init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
    expect(headers['Content-Type']).toContain('application/json');

    const body = requestBody(call);
    expect(body.model).toBe('test-model');
    expect(body.temperature).toBeLessThanOrEqual(0.3);
    expect(body.messages?.[0]?.role).toBe('system');
    expect(body.messages?.[1]?.role).toBe('user');
  });

  it('待译文本进入 user 消息，目标语言进入系统提示词', async () => {
    const { client, calls } = setup(async () => chatResponse('你好'));

    await client.translate({ text: 'Hello world', targetLang: 'zh' });

    const body = requestBody(calls[0]);
    expect(body.messages?.[1]?.content).toContain('Hello world');
    expect(body.messages?.[0]?.content).toContain('zh');
  });

  it('baseUrl 尾部斜杠不会拼出双斜杠', async () => {
    const { client, calls } = setup(async () => chatResponse('你好'), {
      baseUrl: 'https://api.example.com/v1/',
    });

    await client.translate({ text: 'Hi', targetLang: 'zh' });

    expect(calls[0]?.url).toBe('https://api.example.com/v1/chat/completions');
  });

  it('正确取出首条译文', async () => {
    const { client } = setup(async () => chatResponse('你好，世界'));

    const result = await client.translate({ text: 'Hello world', targetLang: 'zh' });

    expect(result.translated).toBe('你好，世界');
    expect(result.sourceLang).toBe('auto');
  });

  it('网络失败时抛出可区分的 network 错误', async () => {
    const { client } = setup(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(client.translate({ text: 'x', targetLang: 'zh' })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('非 2xx 时抛出带 status 的 http 错误', async () => {
    const { client } = setup(async () => new Response('rate limited', { status: 429 }));

    await expect(client.translate({ text: 'x', targetLang: 'zh' })).rejects.toMatchObject({
      kind: 'http',
      status: 429,
    });
  });

  it('响应结构异常时抛出 format 错误', async () => {
    const { client } = setup(async () => new Response(JSON.stringify({}), { status: 200 }));

    await expect(client.translate({ text: 'x', targetLang: 'zh' })).rejects.toMatchObject({
      kind: 'format',
    });
  });

  it('抛出的错误都是 AiTranslationError 实例，便于上层统一判断', async () => {
    const { client } = setup(async () => new Response('"choices": []'.slice(0), { status: 500 }));

    const error = await client.translate({ text: 'x', targetLang: 'zh' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiTranslationError);
  });
});
