/**
 * DOM 变化监听：SPA 框架（React/Vue）随时会重渲染页面，
 * 把我们插入的译文抹掉、或追加新内容。
 * 监听到变化后防抖回调，由调用方重新提取并翻译（增量，命中缓存的秒回）。
 */

import { TARGET_CLASS } from '../shared/translated-mark';

export type MutationListenerOptions = {
  /** 防抖窗口：短时间内的连续变化合并为一次处理 */
  debounceMs?: number;
};

/** 是不是我们自己插入的译文节点 */
function isTranslationNode(node: Node): boolean {
  const element = node as Element;
  // 用 nodeType 数字判断而非 instanceof：跨 realm 时 instanceof 会失效
  return node.nodeType === 1 && element.classList?.contains(TARGET_CLASS) === true;
}

/**
 * 这批变更是否全是「我们自己的写入」。
 *
 * 渲染译文本身就会改 DOM，若不排除，就会变成
 * 「插入译文 → 触发监听 → 再翻译 → 再插入」的自我触发死循环，白白消耗性能。
 */
function isOwnChange(records: MutationRecord[]): boolean {
  for (const record of records) {
    const changed = [...record.addedNodes, ...record.removedNodes];
    // 只要有一条改动不是译文节点，就说明页面确实变了
    if (!changed.every(isTranslationNode)) {
      return false;
    }
  }

  return true;
}

export function observeMutations(
  root: ParentNode,
  onSettled: () => unknown,
  options: MutationListenerOptions = {},
): MutationObserver {
  const debounceMs = options.debounceMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const observer = new MutationObserver((records) => {
    if (isOwnChange(records)) {
      return;
    }

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
