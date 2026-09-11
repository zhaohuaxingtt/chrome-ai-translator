/**
 * 常驻悬浮球：页面右下角，点击展开菜单。
 *
 * 宿主页面的 CSS 千差万别，所以样式全部内联并对关键项加 !important；
 * 点击事件一律 stopPropagation，避免冒泡到页面触发页面自身逻辑。
 *
 * 挂载点与回调全部注入，因此可在 DOM 环境里单测。
 */

export interface FloatingBallOptions {
  root: HTMLElement;
  /** 点「翻译本页 / 停止翻译」 */
  onToggleTranslate: () => void;
  /** 点「打开设置」 */
  onOpenSettings: () => void;
  /** 点「隐藏悬浮球」 */
  onHide: () => void;
}

export interface FloatingBallHandle {
  /** 同步「本页是否已翻译」的视觉状态 */
  setTranslated(translated: boolean): void;
  /** 翻译进行中 */
  setBusy(busy: boolean): void;
  /** 从页面移除 */
  destroy(): void;
}

const BALL_SIZE = 52;
const COLOR_IDLE = '#0969da';
const COLOR_DONE = '#1a7f37';
const COLOR_BUSY = '#9a6700';

const CONTAINER_STYLE = [
  'position: fixed !important',
  'right: 24px !important',
  'bottom: 24px !important',
  'z-index: 2147483647 !important',
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif !important",
].join(';');

const MENU_STYLE = [
  'position: absolute !important',
  'right: 0 !important',
  `bottom: ${BALL_SIZE + 10}px !important`,
  'min-width: 176px !important',
  'background: #1c2128 !important',
  'border-radius: 10px !important',
  'box-shadow: 0 8px 24px rgba(0,0,0,0.45) !important',
  'overflow: hidden !important',
  'padding: 4px !important',
].join(';');

const ITEM_STYLE = [
  'display: block !important',
  'width: 100% !important',
  'padding: 10px 14px !important',
  'background: transparent !important',
  'border: none !important',
  'color: #e6edf3 !important',
  'font-size: 13px !important',
  'text-align: left !important',
  'cursor: pointer !important',
].join(';');

function ballStyle(color: string): string {
  return [
    `width: ${BALL_SIZE}px !important`,
    `height: ${BALL_SIZE}px !important`,
    'border-radius: 50% !important',
    'border: none !important',
    `background: ${color} !important`,
    'color: #ffffff !important',
    'font-size: 17px !important',
    'cursor: pointer !important',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.35) !important',
    'display: flex !important',
    'align-items: center !important',
    'justify-content: center !important',
    'padding: 0 !important',
  ].join(';');
}

export function createFloatingBall(options: FloatingBallOptions): FloatingBallHandle {
  const doc = options.root.ownerDocument;

  const container = doc.createElement('div');
  container.className = 'ai-fab';
  container.setAttribute('style', CONTAINER_STYLE);

  const menu = doc.createElement('div');
  menu.className = 'ai-fab-menu';
  menu.setAttribute('style', MENU_STYLE);

  const ball = doc.createElement('button');
  ball.className = 'ai-fab-ball';
  ball.type = 'button';
  ball.textContent = '译';
  ball.title = 'AI 实时翻译';
  ball.setAttribute('style', ballStyle(COLOR_IDLE));

  const makeItem = (label: string, onClick: () => void): HTMLButtonElement => {
    const item = doc.createElement('button');
    item.type = 'button';
    item.className = 'ai-fab-item';
    item.textContent = label;
    item.setAttribute('style', ITEM_STYLE);
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      setMenuOpen(false);
      onClick();
    });
    return item;
  };

  const toggleItem = makeItem('翻译本页', options.onToggleTranslate);
  const settingsItem = makeItem('打开设置', options.onOpenSettings);
  const hideItem = makeItem('隐藏悬浮球', options.onHide);

  menu.append(toggleItem, settingsItem, hideItem);
  container.append(menu, ball);
  options.root.append(container);

  let menuOpen = false;
  let busy = false;
  let translated = false;

  function setMenuOpen(open: boolean): void {
    menuOpen = open;
    menu.style.display = open ? 'block' : 'none';
  }

  setMenuOpen(false);

  function render(): void {
    const color = busy ? COLOR_BUSY : translated ? COLOR_DONE : COLOR_IDLE;
    ball.setAttribute('style', ballStyle(color));
    toggleItem.textContent = translated ? '停止翻译' : '翻译本页';
  }

  ball.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    setMenuOpen(!menuOpen);
  });

  // 点页面其他地方收起菜单
  doc.addEventListener('click', () => {
    if (menuOpen) {
      setMenuOpen(false);
    }
  });

  return {
    setTranslated(next: boolean): void {
      translated = next;
      render();
    },
    setBusy(next: boolean): void {
      busy = next;
      render();
    },
    destroy(): void {
      container.remove();
    },
  };
}
