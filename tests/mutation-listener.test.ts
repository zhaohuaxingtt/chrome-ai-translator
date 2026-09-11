import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeMutations } from '../src/content/mutation-listener';

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
});
