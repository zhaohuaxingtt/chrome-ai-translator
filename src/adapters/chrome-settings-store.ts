import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type SettingsPort,
} from '../shared/settings';

const SETTINGS_KEY = 'settings';

/** 设置持久化在 chrome.storage.sync，可随用户账号同步 */
export class ChromeSettingsStore implements SettingsPort {
  async get(): Promise<ExtensionSettings> {
    const stored = await chrome.storage.sync.get(SETTINGS_KEY);
    const value: unknown = stored[SETTINGS_KEY];

    if (typeof value !== 'object' || value === null) {
      return { ...DEFAULT_SETTINGS };
    }

    // 用默认值兜底，避免旧版本存储缺字段
    return { ...DEFAULT_SETTINGS, ...(value as Partial<ExtensionSettings>) };
  }

  async set(patch: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.get();
    await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...current, ...patch } });
  }
}
