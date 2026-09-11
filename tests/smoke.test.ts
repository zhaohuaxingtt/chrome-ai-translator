import { describe, expect, it } from 'vitest';
import { manifestConfig } from '../manifest.config';

describe('扩展骨架', () => {
  it('manifest 声明为 Manifest V3', () => {
    expect(manifestConfig.manifest_version).toBe(3);
  });

  it('四个入口齐备：popup / background / content script / options', () => {
    expect(manifestConfig.action.default_popup).toBeTruthy();
    expect(manifestConfig.background.service_worker).toBeTruthy();
    expect(manifestConfig.content_scripts[0]?.js[0]).toBeTruthy();
    expect(manifestConfig.options_page).toBeTruthy();
  });

  it('权限收敛到翻译所需的最小集合', () => {
    expect(manifestConfig.permissions).toEqual(['storage']);
    expect(manifestConfig.host_permissions).toEqual(['http://*/*', 'https://*/*']);
  });

  it('DOM 环境可用（供后续 DOM 模块测试）', () => {
    expect(typeof document).toBe('object');
    expect(typeof document.createElement).toBe('function');
  });
});
