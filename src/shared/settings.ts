/** 用户设置。API 凭据只存在于 background 侧，绝不传给 content script。 */

export interface ExtensionSettings {
  /** 全局翻译开关 */
  enabled: boolean;
  /** 目标语言 */
  targetLang: string;
  /** OpenAI 兼容接口地址 */
  baseUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 模型名 */
  model: string;
  /** 排除站点（主机名） */
  excludedHosts: string[];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  targetLang: 'zh-CN',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  excludedHosts: [],
};

export interface SettingsPort {
  get(): Promise<ExtensionSettings>;
  set(patch: Partial<ExtensionSettings>): Promise<void>;
}
