/**
 * 译文渲染器：在原文「下方」追加译文，完全不改动原文。
 *
 * 与「替换式双语」不同，这里保留原站点的结构与样式：
 * 原文节点一个都不动，只在该块最后一个文本节点之后插入译文节点。
 */

import { TRANSLATED_ATTR, type TextBlock } from '../extractor/block-extractor';

export { TARGET_CLASS } from '../../shared/translated-mark';
import { TARGET_CLASS, TARGET_FOR_ATTR } from '../../shared/translated-mark';

export function renderTranslation(block: TextBlock, translated: string): void {
  const anchor = block.nodes[block.nodes.length - 1];
  if (anchor === undefined) {
    return;
  }

  const doc = anchor.ownerDocument;

  // 幂等：先清掉本块已有的译文，避免重复渲染时叠加
  for (const stale of block.element.querySelectorAll(`.${TARGET_CLASS}`)) {
    stale.remove();
  }

  const target = doc.createElement('span');
  target.className = TARGET_CLASS;
  target.textContent = translated;
  // 标明这份译文属于哪个块，供提取器精确判断「该块是否已翻译」
  target.setAttribute(TARGET_FOR_ATTR, block.id);
  // 独占一行显示在原文下方；颜色继承站点样式。
  // 用 important 是必要的保险：个别站点的样式表会覆盖 span 的 display，
  // 导致译文虽然插进了 DOM 却不可见。
  target.style.setProperty('display', 'block', 'important');

  anchor.after(target);

  // 标记打在容器上，供提取器跳过整个块
  block.element.setAttribute(TRANSLATED_ATTR, 'true');
}

export function revertTranslation(block: TextBlock): void {
  for (const target of block.element.querySelectorAll(`.${TARGET_CLASS}`)) {
    target.remove();
  }

  block.element.removeAttribute(TRANSLATED_ATTR);
}
