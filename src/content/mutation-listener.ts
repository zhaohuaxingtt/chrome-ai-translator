/**
 * DOM 变化监听：SPA 框架（React/Vue）随时会重渲染页面，
 * 把我们插入的译文抹掉、或追加新内容。
 * 监听到变化后防抖回调，由调用方重新提取并翻译（增量，命中缓存的秒回）。
 */

export type MutationListenerOptions = {
  /** 防抖窗口：短时间内的连续变化合并为一次处理 */
  debounceMs?: number;
};

export function observeMutations(
  root: ParentNode,
  onSettled: () => unknown,
  options: MutationListenerOptions = {},
): MutationObserver {
  const debounceMs = options.debounceMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const observer = new MutationObserver(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void onSettled();
    }, debounceMs);
  });

  observer.observe(root, { childList: true, subtree: true });

  return observer;
}
