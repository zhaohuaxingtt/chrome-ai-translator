import { ChromeSettingsStore } from '../adapters/chrome-settings-store';
import { LANGUAGES } from '../shared/languages';
import {
  loadPopupState,
  setEnabled,
  setTargetLang,
  toggleSiteExclusion,
} from './popup-controller';

const settings = new ChromeSettingsStore();
const deps = { settings };

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`弹窗缺少元素 #${id}`);
  }
  return found as T;
}

function fillLanguages(current: string): void {
  const select = el<HTMLSelectElement>('targetLang');
  select.innerHTML = '';

  // 已保存的语言可能不在预设里，补进去避免显示为空
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

async function currentHostname(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;

  if (url === undefined) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return ''; // chrome:// 等内部页面没有主机名
  }
}

async function render(): Promise<void> {
  const hostname = await currentHostname();
  const state = await loadPopupState(deps, hostname);

  fillLanguages(state.targetLang);
  el<HTMLInputElement>('enabled').checked = state.enabled;

  const siteLabel = el<HTMLSpanElement>('siteLabel');
  const toggleSite = el<HTMLButtonElement>('toggleSite');

  if (hostname === '') {
    siteLabel.textContent = '当前页面不可翻译';
    toggleSite.disabled = true;
  } else {
    siteLabel.textContent = hostname;
    siteLabel.title = hostname;
    toggleSite.disabled = false;
    toggleSite.textContent = state.excluded ? '恢复本站' : '排除本站';
  }
}

el<HTMLSelectElement>('targetLang').addEventListener('change', (event) => {
  const value = (event.target as HTMLSelectElement).value;

  void setTargetLang(deps, value)
    .then(async () => {
      el<HTMLParagraphElement>('hint').textContent = '已保存，正在刷新页面…';
      // 已翻译的内容属于旧语言，重载当前页让新语言生效
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) {
        await chrome.tabs.reload(tab.id);
      }
    })
    .then(() => {
      window.close();
    });
});

el<HTMLInputElement>('enabled').addEventListener('change', (event) => {
  const checked = (event.target as HTMLInputElement).checked;
  void setEnabled(deps, checked).then(() => {
    el<HTMLParagraphElement>('hint').textContent = checked
      ? '已启用，刷新页面后翻译新页面'
      : '已停用';
  });
});

el<HTMLButtonElement>('toggleSite').addEventListener('click', () => {
  void currentHostname()
    .then((hostname) => {
      if (hostname === '') {
        return;
      }
      return toggleSiteExclusion(deps, hostname).then(() => render());
    })
    .then(() => {
      el<HTMLParagraphElement>('hint').textContent = '已保存，刷新页面后生效';
    });
});

el<HTMLAnchorElement>('openOptions').addEventListener('click', (event) => {
  event.preventDefault();
  void chrome.runtime.openOptionsPage();
});

void render();
