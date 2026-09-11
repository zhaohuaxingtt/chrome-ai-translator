/**
 * 段落提取器：把页面 DOM 切成一组「段落块」，作为提交给 AI 的翻译单元。
 *
 * 输入是 DOM（测试中用 DOM 环境构造），不依赖浏览器扩展 API。
 */

import { TRANSLATED_ATTR, TARGET_CLASS, TARGET_FOR_ATTR } from '../../shared/translated-mark';
import { isCompactElement } from '../../shared/compact-element';

export interface TextBlock {
  id: string;
  text: string;
  /** 承载该文本的块级容器，用于打「已翻译」标记 */
  element: Element;
  /** 该块包含的文本节点，渲染时定位插入点用（原文节点永不被改写） */
  nodes: Text[];
}

export interface ExtractOptions {
  /** 短于此长度的块视为无意义（标点、单字），不产生翻译请求 */
  minLength?: number;
}

/** 视为「一个翻译单元」的块级标签 */
const BLOCK_TAGS = new Set([
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  // 按钮文本独立成块：否则会归到外层容器，翻译时把按钮一起撑变形
  'BUTTON',
  'DD',
  'DIV',
  'DT',
  'FIGCAPTION',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'LI',
  'MAIN',
  'NAV',
  'P',
  'SECTION',
  'TD',
  'TH',
  'TR',
]);

/** 不该翻译的区域：脚本、样式、代码、表单控件、嵌入内容 */
const SKIP_TAGS = new Set([
  'CANVAS',
  'CODE',
  'IFRAME',
  'NOSCRIPT',
  'OPTION',
  'PRE',
  'SCRIPT',
  'SELECT',
  'STYLE',
  'SVG',
  'TEXTAREA',
]);

export { TRANSLATED_ATTR };
const BLOCK_ID_ATTR = 'data-ai-block-id';

/**
 * 该块是否已完成翻译：既有标记，又存在「属于它自己」的译文节点。
 *
 * 不能用「子树里有没有译文」来判断——大容器里只要残留任意一个译文，
 * 就会被误判成整棵子树都已翻译，导致其余内容被永久跳过、自愈失效。
 */
export function isBlockTranslated(container: Element): boolean {
  if (!container.hasAttribute(TRANSLATED_ATTR)) {
    return false;
  }

  const id = container.getAttribute(BLOCK_ID_ATTR);
  if (id === null) {
    return false;
  }

  return container.querySelector(`.${TARGET_CLASS}[${TARGET_FOR_ATTR}="${id}"]`) !== null;
}

const DEFAULT_MIN_LENGTH = 2;

let idCounter = 0;

/** 稳定标识：首次提取时写入元素，后续复用，保证同一元素 id 不变 */
function blockId(element: Element): string {
  const existing = element.getAttribute(BLOCK_ID_ATTR);
  if (existing !== null && existing !== '') {
    return existing;
  }

  idCounter += 1;
  const id = `block-${idCounter}`;
  element.setAttribute(BLOCK_ID_ATTR, id);
  return id;
}

function ownerDocumentOf(root: ParentNode): Document | null {
  const asElement = root as Element;
  return asElement.ownerDocument ?? (root as Document);
}

/** 文本节点是否落在不该翻译的标签内（脚本、样式、代码、控件…） */
function isInSkippedTag(node: Node, root: ParentNode): boolean {
  let element = node.parentElement;

  while (element !== null) {
    if (SKIP_TAGS.has(element.tagName)) {
      return true;
    }
    if (element === root) {
      return false;
    }
    element = element.parentElement;
  }

  return false;
}

/** 向上找到承载该文本的块级容器 */
function findContainer(node: Node, root: ParentNode): Element | null {
  let element = node.parentElement;
  let last: Element | null = null;

  while (element !== null) {
    last = element;
    // 紧凑控件也单独成块：否则按钮里的文字会归到外层容器，
    // 译文换行时会把按钮/导航项撑变形。
    if (BLOCK_TAGS.has(element.tagName) || isCompactElement(element) || element === root) {
      return element;
    }
    element = element.parentElement;
  }

  return last;
}

export function extractTextBlocks(root: ParentNode, options: ExtractOptions = {}): TextBlock[] {
  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;
  const doc = ownerDocumentOf(root);
  if (doc === null || typeof doc.createTreeWalker !== 'function') {
    return [];
  }

  const grouped = new Map<Element, Text[]>();
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node !== null) {
    const raw = node.nodeValue;

    if (raw !== null && raw.trim() !== '' && !isInSkippedTag(node, root)) {
      const container = findContainer(node, root);
      // 只跳过「自己已完成翻译」的块：祖先带标记不代表本块已翻
      if (container !== null && !isBlockTranslated(container)) {
        const nodes = grouped.get(container);
        if (nodes === undefined) {
          grouped.set(container, [node as Text]);
        } else {
          nodes.push(node as Text);
        }
      }
    }

    node = walker.nextNode();
  }

  const blocks: TextBlock[] = [];

  for (const [element, nodes] of grouped) {
    // 拼回原文时合并连续空白，避免跨内联元素处出现双空格
    const text = nodes
      .map((item) => item.nodeValue ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length >= minLength) {
      blocks.push({ id: blockId(element), text, element, nodes });
    }
  }

  return blocks;
}
