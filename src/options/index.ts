import { ChromeSettingsStore } from '../adapters/chrome-settings-store';
import { IndexedDbCacheStorage } from '../adapters/indexeddb-cache-storage';
import { TranslationCache } from '../core/cache/translation-cache';
import { addExcludedHost, removeExcludedHost } from './excluded-hosts';
import { formatBytes, loadOptions, saveOptions } from './options-controller';
import { LANGUAGES } from '../shared/languages';

const settings = new ChromeSettingsStore();
const cache = new TranslationCache({ storage: new IndexedDbCacheStorage() });

const deps = {
  settings,
  cache: { clear: () => cache.clear() },
  estimate: {
    estimateBytes: async (): Promise<number> => {
      const estimate = await navigator.storage.estimate();
      return estimate.usage ?? 0;
    },
  },
};

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`设置页缺少元素 #${id}`);
  }
  return found as T;
}

let excludedHosts: string[] = [];

function renderHostList(): void {
  const list = el<HTMLUListElement>('hostList');
  const empty = el<HTMLParagraphElement>('hostEmpty');

  list.innerHTML = '';
  empty.style.display = excludedHosts.length === 0 ? 'block' : 'none';

  for (const host of excludedHosts) {
    const item = document.createElement('li');

    const name = document.createElement('span');
    name.textContent = host;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '移除';
    remove.dataset.host = host;

    item.append(name, remove);
    list.append(item);
  }
}

function fillLanguageOptions(current: string): void {
  const select = el<HTMLSelectElement>('targetLang');
  select.innerHTML = '';

  // 已保存的语言可能不在预设列表里，补进去以免显示为空
  const options = LANGUAGES.some((item) => item.code === current)
    ? LANGUAGES
    : [{ code: current, label: current }, ...LANGUAGES];

  for (const item of options) {
    const option = document.createElement('option');
    option.value = item.code;
    option.textContent = item.label;
    select.append(option);
  }

  select.value = current;
}

async function render(): Promise<void> {
  const state = await loadOptions(deps);

  excludedHosts = state.settings.excludedHosts;

  el<HTMLInputElement>('baseUrl').value = state.settings.baseUrl;
  el<HTMLInputElement>('apiKey').value = state.settings.apiKey;
  el<HTMLInputElement>('model').value = state.settings.model;
  el<HTMLSpanElement>('cacheSize').textContent = formatBytes(state.cacheBytes);

  fillLanguageOptions(state.settings.targetLang);
  renderHostList();
}

el<HTMLButtonElement>('save').addEventListener('click', () => {
  void saveOptions(deps, {
    baseUrl: el<HTMLInputElement>('baseUrl').value,
    apiKey: el<HTMLInputElement>('apiKey').value,
    model: el<HTMLInputElement>('model').value,
    targetLang: el<HTMLSelectElement>('targetLang').value,
    excludedHosts,
  }).then(() => {
    el<HTMLSpanElement>('status').textContent = '已保存';
  });
});

el<HTMLButtonElement>('addHost').addEventListener('click', () => {
  const input = el<HTMLInputElement>('hostInput');
  excludedHosts = addExcludedHost(excludedHosts, input.value);
  input.value = '';
  renderHostList();
});

// 列表项动态生成，用事件委托处理移除
el<HTMLUListElement>('hostList').addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const host = target.dataset.host;
  if (host === undefined) {
    return;
  }
  excludedHosts = removeExcludedHost(excludedHosts, host);
  renderHostList();
});

el<HTMLButtonElement>('clearCache').addEventListener('click', () => {
  void deps.cache.clear().then(() => {
    el<HTMLSpanElement>('status').textContent = '缓存已清空';
    return render();
  });
});

void render();
