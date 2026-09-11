import { IndexedDbCacheStorage } from '../adapters/indexeddb-cache-storage';
import { ChromeSettingsStore } from '../adapters/chrome-settings-store';
import { TranslationCache } from '../core/cache/translation-cache';
import { TranslationScheduler } from '../core/scheduler/translation-scheduler';
import { AiTranslationClient } from '../core/translator/ai-client';
import {
  isOpenOptionsMessage,
  isTranslateRequestMessage,
  type TranslateResponse,
} from '../shared/messages';
import { handleTranslateRequest } from './translate-handler';

/**
 * Background Service Worker：唯一的「出网口」与「密钥保管处」。
 * Content Script 只提交待译文本，拿到的只有译文。
 */

const settingsStore = new ChromeSettingsStore();
const cache = new TranslationCache({ storage: new IndexedDbCacheStorage() });

/** 每次请求按当前设置构建，保证设置改动立即生效 */
async function buildScheduler(): Promise<TranslationScheduler> {
  const settings = await settingsStore.get();

  const client = new AiTranslationClient({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    fetchImpl: (url, init) => fetch(url, init),
  });

  return new TranslationScheduler({ cache, client });
}

function failureResponse(
  blocks: Array<{ id: string }>,
  error: unknown,
): TranslateResponse {
  return {
    results: [],
    errors: blocks.map((block) => ({
      id: block.id,
      message: error instanceof Error ? error.message : String(error),
      kind: 'unknown',
    })),
  };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  // Content Script 打开不了设置页（其可用 API 子集里没有 openOptionsPage），由这里代劳
  if (isOpenOptionsMessage(message)) {
    void chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (!isTranslateRequestMessage(message)) {
    return false;
  }

  const payload = message.payload;

  buildScheduler()
    .then((scheduler) =>
      handleTranslateRequest(payload, {
        translate: (text, targetLang) => scheduler.translate(text, targetLang),
      }),
    )
    .then((response) => {
      sendResponse(response);
    })
    .catch((error: unknown) => {
      // 即使整体失败也要回包，否则 content script 会一直等
      console.error('[AI 实时翻译] 背景处理失败：', error);
      sendResponse(failureResponse(payload.blocks, error));
    });

  return true; // 保持消息通道，支持异步响应
});
