import { describe, expect, it } from 'vitest';
import {
  isOpenOptionsMessage,
  isTranslateRequestMessage,
  OPEN_OPTIONS_REQUEST,
  TRANSLATE_REQUEST,
} from '../src/shared/messages';

describe('消息类型守卫', () => {
  it('识别「打开设置」消息', () => {
    expect(isOpenOptionsMessage({ type: OPEN_OPTIONS_REQUEST })).toBe(true);
    expect(isOpenOptionsMessage({ type: TRANSLATE_REQUEST })).toBe(false);
  });

  it('识别「翻译请求」消息', () => {
    const message = {
      type: TRANSLATE_REQUEST,
      payload: { blocks: [{ id: 'b1', text: 'Hello' }], targetLang: 'zh' },
    };

    expect(isTranslateRequestMessage(message)).toBe(true);
    expect(isTranslateRequestMessage({ type: OPEN_OPTIONS_REQUEST })).toBe(false);
  });

  it('非法输入一律不识别', () => {
    for (const value of [null, undefined, 42, 'text', {}]) {
      expect(isOpenOptionsMessage(value)).toBe(false);
      expect(isTranslateRequestMessage(value)).toBe(false);
    }
  });
});
