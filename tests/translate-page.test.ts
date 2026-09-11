import { beforeEach, describe, expect, it } from 'vitest';
import { translatePage, type PageContext } from '../src/content/translate-page';
import { TARGET_CLASS } from '../src/core/renderer/bilingual-renderer';
import type { TranslateRequestPayload, TranslateResponse } from '../src/shared/messages';

const CONTEXT: PageContext = {
  enabled: true,
  targetLang: 'zh',
  excludedHosts: [],
};

interface Recorder {
  deps: Parameters<typeof translatePage>[0];
  sent: TranslateRequestPayload[];
}

function setup(
  context: PageContext,
  respond: (payload: TranslateRequestPayload) => TranslateResponse,
  hostname = 'example.com',
): Recorder {
  const sent: TranslateRequestPayload[] = [];

  const deps = {
    root: document.body,
    hostname,
    getContext: async () => context,
    sendTranslateRequest: async (payload: TranslateRequestPayload) => {
      sent.push(payload);
      return respond(payload);
    },
  };

  return { deps, sent };
}

/** 把每块原文前缀成「译:原文」，便于断言渲染到了正确的元素上 */
function echoTranslate(payload: TranslateRequestPayload): TranslateResponse {
  return {
    results: payload.blocks.map((block) => ({
      id: block.id,
      translated: `译:${block.text}`,
      sourceLang: 'auto',
    })),
    errors: [],
  };
}

describe('整页翻译', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('提取全页文本、请求翻译并渲染为双语对照', async () => {
    document.body.innerHTML = '<p>Hello world</p><p>Second line</p>';
    const { deps, sent } = setup(CONTEXT, echoTranslate);

    const rendered = await translatePage(deps);

    expect(rendered).toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.targetLang).toBe('zh');
    expect(sent[0]?.blocks.map((b) => b.text)).toEqual(['Hello world', 'Second line']);

    const targets = document.body.querySelectorAll(`.${TARGET_CLASS}`);
    expect([...targets].map((el) => el.textContent)).toEqual([
      '译:Hello world',
      '译:Second line',
    ]);
    // 原文保留，译文追加在其后
    expect(document.body.querySelectorAll('p')[0]?.textContent).toContain('Hello world');
  });

  it('开关关闭时不发请求、不渲染', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const { deps, sent } = setup({ ...CONTEXT, enabled: false }, echoTranslate);

    const rendered = await translatePage(deps);

    expect(rendered).toBe(0);
    expect(sent).toHaveLength(0);
    expect(document.body.querySelector(`.${TARGET_CLASS}`)).toBeNull();
  });

  it('排除站点（含子域名）不翻译', async () => {
    document.body.innerHTML = '<p>Hello world</p>';

    const exact = setup({ ...CONTEXT, excludedHosts: ['example.com'] }, echoTranslate, 'example.com');
    expect(await translatePage(exact.deps)).toBe(0);
    expect(exact.sent).toHaveLength(0);

    const subdomain = setup(
      { ...CONTEXT, excludedHosts: ['example.com'] },
      echoTranslate,
      'www.example.com',
    );
    expect(await translatePage(subdomain.deps)).toBe(0);
    expect(subdomain.sent).toHaveLength(0);
  });

  it('没有待译文本时不发请求', async () => {
    document.body.innerHTML = '';
    const { deps, sent } = setup(CONTEXT, echoTranslate);

    expect(await translatePage(deps)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('部分块失败时只渲染成功的，原文保持不变', async () => {
    document.body.innerHTML = '<p>Good</p><p>Bad</p>';
    const { deps } = setup(CONTEXT, (payload) => ({
      results: [
        { id: payload.blocks[0]?.id ?? '', translated: '译:Good', sourceLang: 'auto' },
      ],
      errors: [{ id: payload.blocks[1]?.id ?? '', message: '配额不足', kind: 'http' }],
    }));

    const rendered = await translatePage(deps);

    expect(rendered).toBe(1);
    expect(document.body.querySelectorAll(`.${TARGET_CLASS}`)).toHaveLength(1);
    expect(document.body.querySelectorAll('p')[1]?.textContent).toBe('Bad');
  });

  it('超过批次大小时自动分多次请求，随到随渲染', async () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `<p>Block ${i}</p>`).join('');
    document.body.innerHTML = paragraphs;
    const { deps, sent } = setup(CONTEXT, echoTranslate);

    const rendered = await translatePage(deps);

    expect(rendered).toBe(10);
    expect(sent).toHaveLength(3); // 4 + 4 + 2
    expect(sent[0]?.blocks).toHaveLength(4);
    expect(sent[1]?.blocks).toHaveLength(4);
    expect(sent[2]?.blocks).toHaveLength(2);
    expect(document.body.querySelectorAll(`.${TARGET_CLASS}`)).toHaveLength(10);
  });

  it('批通信持续失败只损失该批，不中断整页', async () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) => `<p>Block ${i}</p>`).join('');
    document.body.innerHTML = paragraphs;
    let calls = 0;
    const deps: Parameters<typeof translatePage>[0] = {
      root: document.body,
      hostname: 'example.com',
      getContext: async () => CONTEXT,
      sendTranslateRequest: async (payload) => {
        calls += 1;
        if (calls <= 2) {
          throw new Error('message channel closed'); // 第一批首试与重试均失败
        }
        return echoTranslate(payload);
      },
    };

    const rendered = await translatePage(deps);

    expect(calls).toBe(3); // 批1 试两次 + 批2 一次
    expect(rendered).toBe(1); // 只有第二批的 1 块成功
  });

  it('批通信失败会重试，重试成功则照常渲染', async () => {
    document.body.innerHTML = '<p>Hello world</p>';
    let calls = 0;
    const deps: Parameters<typeof translatePage>[0] = {
      root: document.body,
      hostname: 'example.com',
      getContext: async () => CONTEXT,
      sendTranslateRequest: async (payload) => {
        calls += 1;
        if (calls === 1) {
          throw new Error('message channel closed');
        }
        return echoTranslate(payload);
      },
    };

    const rendered = await translatePage(deps);

    expect(calls).toBe(2);
    expect(rendered).toBe(1);
    expect(document.body.querySelector(`.${TARGET_CLASS}`)).not.toBeNull();
  });

  it('配置类错误（4xx）整批失败时熔断，不再发后续批次', async () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => `<p>Block ${i}</p>`).join('');
    document.body.innerHTML = paragraphs;
    let calls = 0;
    const deps: Parameters<typeof translatePage>[0] = {
      root: document.body,
      hostname: 'example.com',
      getContext: async () => CONTEXT,
      sendTranslateRequest: async (payload) => {
        calls += 1;
        return {
          results: [],
          errors: payload.blocks.map((block) => ({
            id: block.id,
            message: '翻译服务返回 400',
            kind: 'http',
            status: 400,
          })),
        };
      },
    };

    const rendered = await translatePage(deps);

    expect(rendered).toBe(0);
    expect(calls).toBe(1); // 8 块分 3 批，但第一批全 400 后即停止
  });
});
