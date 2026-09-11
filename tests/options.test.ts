import { describe, expect, it } from 'vitest';
import {
  addExcludedHost,
  removeExcludedHost,
} from '../src/options/excluded-hosts';
import {
  loadOptions,
  saveOptions,
  type OptionsDeps,
} from '../src/options/options-controller';
import { DEFAULT_SETTINGS, type ExtensionSettings, type SettingsPort } from '../src/shared/settings';

class MemorySettings implements SettingsPort {
  current: ExtensionSettings = { ...DEFAULT_SETTINGS };

  async get(): Promise<ExtensionSettings> {
    return { ...this.current, excludedHosts: [...this.current.excludedHosts] };
  }

  async set(patch: Partial<ExtensionSettings>): Promise<void> {
    this.current = { ...this.current, ...patch };
  }
}

function setup(cacheBytes = 0) {
  const settings = new MemorySettings();
  let cleared = 0;

  const deps: OptionsDeps = {
    settings,
    cache: {
      clear: async () => {
        cleared += 1;
      },
    },
    estimate: {
      estimateBytes: async () => cacheBytes,
    },
  };

  return { deps, settings, clearedCount: () => cleared };
}

describe('排除站点列表', () => {
  it('新增站点会做规范化（去空白、转小写）', () => {
    expect(addExcludedHost([], '  Example.COM ')).toEqual(['example.com']);
  });

  it('重复站点不会重复加入', () => {
    expect(addExcludedHost(['example.com'], 'example.com')).toEqual(['example.com']);
  });

  it('空白输入被忽略', () => {
    expect(addExcludedHost(['a.com'], '   ')).toEqual(['a.com']);
  });

  it('移除站点', () => {
    expect(removeExcludedHost(['a.com', 'b.com'], 'a.com')).toEqual(['b.com']);
  });

  it('移除不存在的站点不影响原列表', () => {
    expect(removeExcludedHost(['a.com'], 'zzz.com')).toEqual(['a.com']);
  });
});

describe('设置面板', () => {
  it('读取当前设置与缓存占用', async () => {
    const { deps } = setup(2048);

    const state = await loadOptions(deps);

    expect(state.settings.targetLang).toBe(DEFAULT_SETTINGS.targetLang);
    expect(state.cacheBytes).toBe(2048);
  });

  it('保存表单值会写入设置（并去掉首尾空白）', async () => {
    const { deps, settings } = setup();

    await saveOptions(deps, {
      baseUrl: ' https://api.example.com/v1 ',
      apiKey: ' sk-test ',
      model: ' my-model ',
      targetLang: 'ja',
      excludedHosts: ['a.com'],
    });

    expect(settings.current.baseUrl).toBe('https://api.example.com/v1');
    expect(settings.current.apiKey).toBe('sk-test');
    expect(settings.current.model).toBe('my-model');
    expect(settings.current.targetLang).toBe('ja');
    expect(settings.current.excludedHosts).toEqual(['a.com']);
  });

  it('清空缓存会调用缓存端口', async () => {
    const { deps, clearedCount } = setup();

    await deps.cache.clear();

    expect(clearedCount()).toBe(1);
  });
});
