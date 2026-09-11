import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeMutations } from '../src/content/mutation-listener';
import { TARGET_CLASS } from '../src/shared/translated-mark';

describe('DOM 变化监听', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('内容变化后在防抖窗口结束时会触发回调', async () => {
    const callback = vi.fn();
    const observer = observeMutations(document.body, callback);

    document.body.innerHTML = '<p>New content</p>';
    await vi.advanceTimersByTimeAsync(500);

    expect(callback).toHaveBeenCalledTimes(1);
    observer.disconnect();
  });

  it('防抖窗口内的连续变化只触发一次回调', async () => {
    const callback = vi.fn();
    const observer = observeMutations(document.body, callback);

    document.body.innerHTML = '<p>One</p>';
    await vi.advanceTimersByTimeAsync(300);
    document.body.innerHTML += '<p>Two</p>';
    await vi.advanceTimersByTimeAsync(300);
    document.body.innerHTML += '<p>Three</p>';
    await vi.advanceTimersByTimeAsync(500);

    expect(callback).toHaveBeenCalledTimes(1);
    observer.disconnect();
  });

  it('断开后不再触发', async () => {
    const callback = vi.fn();
    const observer = observeMutations(document.body, callback);
    observer.disconnect();

    document.body.innerHTML = '<p>Ignored</p>';
    await vi.advanceTimersByTimeAsync(1000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('只涉及译文节点的增删不触发回调（否则会自我触发死循环）', async () => {
    const callback = vi.fn();
    const observer = observeMutations(document.body, callback);

    const target = document.createElement('span');
    target.className = TARGET_CLASS;
    target.textContent = '译文';
    document.body.appendChild(target);
    await vi.advanceTimersByTimeAsync(1000);

    expect(callback).not.toHaveBeenCalled();

    target.remove();
    await vi.advanceTimersByTimeAsync(1000);

    expect(callback).not.toHaveBeenCalled();
    observer.disconnect();
  });

  it('译文节点与真实内容一起变化时仍会触发回调', async () => {
    const callback = vi.fn();
    const observer = observeMutations(document.body, callback);

    const target = document.createElement('span');
    target.className = TARGET_CLASS;
    document.body.appendChild(target);
    document.body.appendChild(document.createElement('p'));

    await vi.advanceTimersByTimeAsync(1000);

    expect(callback).toHaveBeenCalledTimes(1);
    observer.disconnect();
  });
});
