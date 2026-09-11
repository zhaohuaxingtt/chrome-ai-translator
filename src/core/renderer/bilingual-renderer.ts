/**
 * 译文渲染器：在原文之后追加译文，完全不改动原文。
 *
 * 按容器类型分两种呈现：
 * - 段落类（p / li / div…）：译文独占一行，落在原文下方；
 * - 紧凑类（按钮、标签、表头）：译文跟在同一行并用括号包裹，
 *   否则会把按钮、导航项撑高撑变形。
 */

import { TRANSLATED_ATTR, type TextBlock } from '../extractor/block-extractor';
import { isInCompactContainer } from '../../shared/compact-element';

export { TARGET_CLASS } from '../../shared/translated-mark';
import { TARGET_CLASS, TARGET_FOR_ATTR } from '../../shared/translated-mark';

/** 译文基础样式：字号略小、颜色略淡，与原文形成层次又保持可读 */
const BASE_STYLE: Array<[string, string]> = [
  ['font-size', '0.94em'],
  ['line-height', '1.5'],
  ['opacity', '0.85'],
];

const BLOCK_STYLE: Array<[string, string]> = [
  ['display', 'block'],
  ['margin-top', '0.12em'],
  ...BASE_STYLE,
];

const INLINE_STYLE: Array<[string, string]> = [
  ['display', 'inline'],
  ['margin-left', '0.3em'],
  ...BASE_STYLE,
];

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

  const compact = isInCompactContainer(block.element);

  const target = doc.createElement('span');
  target.className = TARGET_CLASS;
  target.textContent = compact ? `(${translated})` : translated;
  // 标明这份译文属于哪个块，供提取器精确判断「该块是否已翻译」
  target.setAttribute(TARGET_FOR_ATTR, block.id);

  // 用 important 是必要的保险：个别站点的样式表会覆盖 span 的 display，
  // 导致译文虽然插进了 DOM 却不可见。
  for (const [property, value] of compact ? INLINE_STYLE : BLOCK_STYLE) {
    target.style.setProperty(property, value, 'important');
  }

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
