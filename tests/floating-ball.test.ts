import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFloatingBall,
  type FloatingBallOptions,
} from '../src/content/floating-ball';

function setup(overrides: Partial<FloatingBallOptions> = {}) {
  const handlers = {
    onToggleTranslate: vi.fn(),
    onOpenSettings: vi.fn(),
    onHide: vi.fn(),
    ...overrides,
  };

  const ball = createFloatingBall({ root: document.body, ...handlers });

  const container = document.body.querySelector('.ai-fab') as HTMLElement;
  const menu = container.querySelector('.ai-fab-menu') as HTMLElement;
  const button = container.querySelector('.ai-fab-ball') as HTMLElement;
  const items = [...container.querySelectorAll('.ai-fab-item')] as HTMLElement[];

  return { ball, handlers, container, menu, button, items };
}

describe('悬浮球', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('渲染出球，菜单默认收起', () => {
    const { container, menu, button } = setup();

    expect(container).not.toBeNull();
    expect(button.textContent).toBe('译');
    expect(menu.style.display).toBe('none');
  });

  it('点击球展开菜单，再点收起', () => {
    const { button, menu } = setup();

    button.click();
    expect(menu.style.display).toBe('block');

    button.click();
    expect(menu.style.display).toBe('none');
  });

  it('菜单含三个操作项', () => {
    const { items } = setup();

    expect(items.map((item) => item.textContent)).toEqual([
      '翻译本页',
      '打开设置',
      '隐藏悬浮球',
    ]);
  });

  it('点「翻译本页」触发回调并收起菜单', () => {
    const { items, handlers, menu } = setup();

    items[0]?.click();

    expect(handlers.onToggleTranslate).toHaveBeenCalledTimes(1);
    expect(menu.style.display).toBe('none');
  });

  it('点「打开设置」与「隐藏悬浮球」各自触发回调', () => {
    const { items, handlers } = setup();

    items[1]?.click();
    items[2]?.click();

    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(handlers.onHide).toHaveBeenCalledTimes(1);
  });

  it('已翻译时菜单项变为「停止翻译」，球换成完成色', () => {
    const { ball, items, button } = setup();

    ball.setTranslated(true);

    expect(items[0]?.textContent).toBe('停止翻译');
    expect(button.getAttribute('style')).toContain('#1a7f37');

    ball.setTranslated(false);
    expect(items[0]?.textContent).toBe('翻译本页');
  });

  it('翻译中显示为忙碌色', () => {
    const { ball, button } = setup();

    ball.setBusy(true);
    expect(button.getAttribute('style')).toContain('#9a6700');
  });

  it('点击不会冒泡到页面，避免触发宿主页面逻辑', () => {
    let pageClicks = 0;
    document.addEventListener('click', () => {
      pageClicks += 1;
    });

    const { button } = setup();
    button.click();

    expect(pageClicks).toBe(0);
  });

  it('destroy 后从页面移除', () => {
    const { ball } = setup();

    ball.destroy();

    expect(document.body.querySelector('.ai-fab')).toBeNull();
  });
});
