/**
 * 「紧凑控件」识别：按钮、标签、表头单元格，以及带按钮样式的元素。
 *
 * 提取器用它决定某段文字是否单独成块，渲染器用它决定译文是否同行显示——
 * 两边必须共用同一套判断，否则会出现「按紧凑渲染、却按段落提取」的错配。
 */

const COMPACT_TAGS = new Set(['BUTTON', 'LABEL', 'SUMMARY', 'TH', 'TD']);

/** 只认最明确的按钮语义，避免把 tag / badge 这类普通标签也判成控件 */
const COMPACT_CLASS_HINT = /(^|[-_ ])(btn|button)([-_ ]|$)/i;

export function isCompactElement(element: Element): boolean {
  if (COMPACT_TAGS.has(element.tagName) || element.getAttribute('role') === 'button') {
    return true;
  }

  const className = element.getAttribute('class') ?? '';
  return COMPACT_CLASS_HINT.test(className);
}

/** 向上探查若干层，判断这个块是否落在某个紧凑控件之内 */
export function isInCompactContainer(element: Element, maxDepth = 4): boolean {
  let current: Element | null = element;
  let depth = 0;

  while (current !== null && depth < maxDepth) {
    if (isCompactElement(current)) {
      return true;
    }
    current = current.parentElement;
    depth += 1;
  }

  return false;
}
