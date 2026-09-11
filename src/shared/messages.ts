/**
 * Content Script 与 Background 之间的消息协议。
 *
 * Content Script 只提交「待译文本」，从不接触 API 凭据——
 * 凭据与网络调用都留在 Background 侧。
 */

export const TRANSLATE_REQUEST = 'TRANSLATE_REQUEST' as const;

/**
 * 请求打开设置页。
 * Content Script 拿不到 chrome.runtime.openOptionsPage（不在其可用的 API 子集里，
 * 尽管类型声明存在——编译期不报错、运行时才炸），只能请 Background 代劳。
 */
export const OPEN_OPTIONS_REQUEST = 'OPEN_OPTIONS_REQUEST' as const;

export interface OpenOptionsMessage {
  type: typeof OPEN_OPTIONS_REQUEST;
}

export function isOpenOptionsMessage(value: unknown): value is OpenOptionsMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { type?: unknown };
  return candidate.type === OPEN_OPTIONS_REQUEST;
}

export interface TranslateRequestBlock {
  id: string;
  text: string;
}

export interface TranslateRequestPayload {
  blocks: TranslateRequestBlock[];
  targetLang: string;
}

export interface TranslateRequestMessage {
  type: typeof TRANSLATE_REQUEST;
  payload: TranslateRequestPayload;
}

export interface TranslateResultItem {
  id: string;
  translated: string;
  sourceLang: string;
}

export interface TranslateErrorItem {
  id: string;
  message: string;
  kind: string;
  /** HTTP 状态码（仅 http 类错误携带），供调用方识别配置类错误 */
  status?: number;
}

/** 用返回值而非抛异常传递失败，保证单个块失败不影响整批 */
export interface TranslateResponse {
  results: TranslateResultItem[];
  errors: TranslateErrorItem[];
}

export function isTranslateRequestMessage(value: unknown): value is TranslateRequestMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { type?: unknown };
  return candidate.type === TRANSLATE_REQUEST;
}
