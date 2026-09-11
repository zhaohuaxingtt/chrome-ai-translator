import { describe, expect, it } from 'vitest';
import {
  loadPopupState,
  setEnabled,
  setTargetLang,
  toggleSiteExclusion,
  type PopupDeps,
} from '../src/popup/popup-controller';
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type SettingsPort,
} from '../src/shared/settings';

class MemorySettings implements SettingsPort {
  current: ExtensionSettings = { ...DEFAULT_SETTINGS };

  async get(): Promise<ExtensionSettings> {
    return { ...this.current, excludedHosts: [...this.current.excludedHosts] };
  }

  async set(patch: Partial<ExtensionSettings>): Promise<void> {
    this.current = { ...this.current, ...patch };
  }
}

function setup() {
  const settings = new MemorySettings();
  const deps: PopupDeps = { settings };
  return { deps, settings };
}

describe('工具栏弹窗', () => {
  it('打开即显示当前生效的开关与语言', async () => {
    const { deps } = setup();

    const state = await loadPopupState(deps, 'example.com');

    expect(state.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(state.targetLang).toBe(DEFAULT_SETTINGS.targetLang);
    expect(state.excluded).toBe(false);
  });

  it('切换开关会持久化', async () => {
    const { deps, settings } = setup();

    await setEnabled(deps, false);
    expect(settings.current.enabled).toBe(false);

    await setEnabled(deps, true);
    expect(settings.current.enabled).toBe(true);
  });

  it('切换目标语言会持久化', async () => {
    const { deps, settings } = setup();

    await setTargetLang(deps, 'ja');

    expect(settings.current.targetLang).toBe('ja');
    expect((await loadPopupState(deps, 'example.com')).targetLang).toBe('ja');
  });

  it('当前站点已在排除列表时标记为已排除', async () => {
    const { deps, settings } = setup();
    await settings.set({ excludedHosts: ['example.com'] });

    expect((await loadPopupState(deps, 'example.com')).excluded).toBe(true);
    // 父域规则覆盖子域名
    expect((await loadPopupState(deps, 'www.example.com')).excluded).toBe(true);
  });

  it('排除当前站点后可再次恢复', async () => {
    const { deps, settings } = setup();

    const excluded = await toggleSiteExclusion(deps, 'example.com');
    expect(excluded).toBe(true);
    expect(settings.current.excludedHosts).toEqual(['example.com']);

    const restored = await toggleSiteExclusion(deps, 'example.com');
    expect(restored).toBe(false);
    expect(settings.current.excludedHosts).toEqual([]);
  });
});
