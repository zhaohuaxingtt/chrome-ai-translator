/**
 * 工具栏弹窗的业务逻辑（语言、开关、当前站点排除）。
 * 设置存储通过注入获得，故可脱离浏览器测试。
 */

import { addExcludedHost, removeExcludedHost } from '../options/excluded-hosts';
import { isExcluded } from '../shared/host-matching';
import type { SettingsPort } from '../shared/settings';

export interface PopupDeps {
  settings: SettingsPort;
}

export interface PopupState {
  enabled: boolean;
  targetLang: string;
  hostname: string;
  excluded: boolean;
}

export async function loadPopupState(deps: PopupDeps, hostname: string): Promise<PopupState> {
  const settings = await deps.settings.get();

  return {
    enabled: settings.enabled,
    targetLang: settings.targetLang,
    hostname,
    excluded: isExcluded(hostname, settings.excludedHosts),
  };
}

export async function setEnabled(deps: PopupDeps, enabled: boolean): Promise<void> {
  await deps.settings.set({ enabled });
}

export async function setTargetLang(deps: PopupDeps, targetLang: string): Promise<void> {
  await deps.settings.set({ targetLang });
}

/**
 * 切换当前站点的排除状态，返回切换后是否处于排除状态。
 * 只增删精确主机名，父域规则（在设置页维护）不受影响。
 */
export async function toggleSiteExclusion(deps: PopupDeps, hostname: string): Promise<boolean> {
  const settings = await deps.settings.get();
  const excluded = isExcluded(hostname, settings.excludedHosts);

  const excludedHosts = excluded
    ? removeExcludedHost(settings.excludedHosts, hostname)
    : addExcludedHost(settings.excludedHosts, hostname);

  await deps.settings.set({ excludedHosts });

  return !excluded;
}
