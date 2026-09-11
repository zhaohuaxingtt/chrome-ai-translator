/**
 * 设置面板的业务逻辑。
 * 依赖（设置存储、缓存、容量估算）全部注入，因此可脱离浏览器测试。
 */

import type { ExtensionSettings, SettingsPort } from '../shared/settings';

export interface CacheManagePort {
  clear(): Promise<void>;
}

export interface StorageEstimatePort {
  estimateBytes(): Promise<number>;
}

export interface OptionsDeps {
  settings: SettingsPort;
  cache: CacheManagePort;
  estimate: StorageEstimatePort;
}

export interface OptionsFormValues {
  baseUrl: string;
  apiKey: string;
  model: string;
  targetLang: string;
  excludedHosts: string[];
}

export interface OptionsViewState {
  settings: ExtensionSettings;
  cacheBytes: number;
}

export async function loadOptions(deps: OptionsDeps): Promise<OptionsViewState> {
  const settings = await deps.settings.get();
  const cacheBytes = await deps.estimate.estimateBytes();

  return { settings, cacheBytes };
}

export async function saveOptions(
  deps: OptionsDeps,
  values: OptionsFormValues,
): Promise<void> {
  await deps.settings.set({
    baseUrl: values.baseUrl.trim(),
    apiKey: values.apiKey.trim(),
    model: values.model.trim(),
    targetLang: values.targetLang.trim(),
    excludedHosts: values.excludedHosts,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
