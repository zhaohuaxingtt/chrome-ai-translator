/**
 * 整页翻译：提取 → 分批请求 → 渐进渲染。
 *
 * 所有对外依赖（页面 DOM、设置、消息通道）都通过 deps 注入，
 * 因此这条端到端链路可以脱离浏览器直接测试。
 */

import { extractTextBlocks, type TextBlock } from '../core/extractor/block-extractor';
import { renderTranslation } from '../core/renderer/bilingual-renderer';
import { isExcluded } from '../shared/host-matching';
import type { TranslateRequestPayload, TranslateResponse } from '../shared/messages';

export interface PageContext {
  enabled: boolean;
  targetLang: string;
  excludedHosts: string[];
}

export interface PageTranslatorDeps {
  root: ParentNode;
  hostname: string;
  getContext: () => Promise<PageContext>;
  sendTranslateRequest: (payload: TranslateRequestPayload) => Promise<TranslateResponse>;
}

/**
 * 每条消息携带的块数。
 * 必须压住单条消息的处理时长：MV3 的 service worker 空闲约 30 秒会被 Chrome 回收，
 * 响应悬空太久就会出现 "message channel closed"。
 * 4 块在 4 路并发下约等于 1 轮 API 往返，是安全区间。
 */
const BATCH_SIZE = 4;

/**
 * 批通信失败重试次数。
 * 失败多数是 service worker 被回收所致——重发消息会唤醒新的 worker，
 * 而且已翻好的块都在缓存里，重试几乎不额外花钱。
 */
const MAX_BATCH_ATTEMPTS = 2;

function renderResults(response: TranslateResponse, byId: Map<string, TextBlock>): number {
  let count = 0;

  for (const result of response.results) {
    const block = byId.get(result.id);
    if (block !== undefined) {
      renderTranslation(block, result.translated);
      count += 1;
    }
  }

  return count;
}

/** 整批失败且是配置类错误（模型名/密钥/地址不对）——永久性，继续发只会重复同样的错 */
function isFatalConfigError(response: TranslateResponse, batchSize: number): boolean {
  if (response.errors.length !== batchSize) {
    return false;
  }

  return response.errors.some(
    (error) =>
      error.kind === 'http' &&
      (error.status === 400 || error.status === 401 || error.status === 403),
  );
}

/** 返回成功渲染的块数量 */
export async function translatePage(deps: PageTranslatorDeps): Promise<number> {
  const context = await deps.getContext();

  if (!context.enabled || isExcluded(deps.hostname, context.excludedHosts)) {
    return 0;
  }

  const blocks = extractTextBlocks(deps.root);
  if (blocks.length === 0) {
    return 0; // 实时监听会频繁触发，无新内容时保持安静
  }
  console.info(`[AI 实时翻译] 提取到 ${blocks.length} 个段落块`);

  const byId = new Map(blocks.map((block) => [block.id, block]));
  let rendered = 0;
  let failed = 0;

  for (let start = 0; start < blocks.length; start += BATCH_SIZE) {
    const batch = blocks.slice(start, start + BATCH_SIZE);
    const payload: TranslateRequestPayload = {
      blocks: batch.map((block) => ({ id: block.id, text: block.text })),
      targetLang: context.targetLang,
    };

    let response: TranslateResponse | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
      try {
        response = await deps.sendTranslateRequest(payload);
        break;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_BATCH_ATTEMPTS) {
          console.warn(`[AI 实时翻译] 本批通信失败，重试（第 ${attempt} 次）`, error);
        }
      }
    }

    if (response === undefined) {
      failed += batch.length;
      console.error('[AI 实时翻译] 本批翻译失败', lastError);
      continue;
    }

    rendered += renderResults(response, byId);
    failed += response.errors.length;

    for (const error of response.errors.slice(0, 3)) {
      console.error(`[AI 实时翻译] 翻译失败（${error.kind}）：${error.message}`);
    }

    if (isFatalConfigError(response, batch.length)) {
      console.error(
        `[AI 实时翻译] API 配置似乎有误（HTTP ${response.errors[0]?.status ?? '?'}），已停止本页翻译。` +
          '请在扩展设置中检查接口地址、API 密钥与模型名。',
      );
      return rendered;
    }
  }

  console.info(`[AI 实时翻译] 翻译完成：成功 ${rendered} 块，失败 ${failed} 块`);

  return rendered;
}
