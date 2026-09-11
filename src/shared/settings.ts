/** 用户设置。API 凭据只存在于 background 侧，绝不传给 content script。 */

export interface ExtensionSettings {
  /** 全局开关：关掉后插件完全不介入（连悬浮球也不显示） */
  enabled: boolean;
  /**
   * 打开页面时是否自动翻译。
   * false（默认）= 按需翻译：页面保持原文，由用户点悬浮球触发。
   */
  autoTranslate: boolean;
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
  autoTranslate: false, // 默认按需翻译，避免打开页面就消耗额度
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
