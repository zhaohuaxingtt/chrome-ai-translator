/**
 * 翻译请求处理器：把一批段落块交给调度器，收集结果。
 *
 * 翻译能力通过 deps.translate 注入，因此本模块可独立测试，
 * 不依赖 chrome.runtime。
 */

import { AiTranslationError, type TranslateResult } from '../core/translator/ai-client';
import type {
  TranslateErrorItem,
  TranslateRequestPayload,
  TranslateResponse,
  TranslateResultItem,
} from '../shared/messages';

export interface TranslateHandlerDeps {
  translate: (text: string, targetLang: string) => Promise<TranslateResult>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function kindOf(error: unknown): TranslateErrorItem['kind'] {
  return error instanceof AiTranslationError ? error.kind : 'unknown';
}

function statusOf(error: unknown): number | undefined {
  return error instanceof AiTranslationError ? error.status : undefined;
}

export async function handleTranslateRequest(
  payload: TranslateRequestPayload,
  deps: TranslateHandlerDeps,
): Promise<TranslateResponse> {
  // 并发发起，由调度器的并发闸门控制实际并发度；
  // Promise.all 保证结果与请求顺序一致
  const settled = await Promise.all(
    payload.blocks.map(async (block) => {
      try {
        const result = await deps.translate(block.text, payload.targetLang);
        return { status: 'ok' as const, block, result };
      } catch (error) {
        return { status: 'error' as const, block, error };
      }
    }),
  );

  const results: TranslateResultItem[] = [];
  const errors: TranslateErrorItem[] = [];

  for (const item of settled) {
    if (item.status === 'ok') {
      results.push({
        id: item.block.id,
        translated: item.result.translated,
        sourceLang: item.result.sourceLang,
      });
    } else {
      errors.push({
        id: item.block.id,
        message: messageOf(item.error),
        kind: kindOf(item.error),
        status: statusOf(item.error),
      });
    }
  }

  return { results, errors };
}
