import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractTextBlocks,
  type TextBlock,
} from '../src/core/extractor/block-extractor';
import {
  TARGET_CLASS,
  renderTranslation,
  revertTranslation,
} from '../src/core/renderer/bilingual-renderer';

function firstBlock(): TextBlock {
  const block = extractTextBlocks(document.body)[0];
  if (block === undefined) {
    throw new Error('测试用例未提取到段落块');
  }
  return block;
}

describe('译文渲染器', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('原文与原有结构完全不动，译文追加在原文之后', () => {
    document.body.innerHTML = '<p>Hello <b>brave</b> world</p>';
    const block = firstBlock();

    renderTranslation(block, '你好，勇敢的世界');

    const paragraph = document.body.querySelector('p');
    // 原有的内联结构保留
    expect(paragraph?.querySelector('b')?.textContent).toBe('brave');
    // 原文本节点一个都没被改写
    expect(block.nodes.map((node) => node.nodeValue).join('')).toBe('Hello brave world');

    const target = paragraph?.querySelector(`.${TARGET_CLASS}`);
    expect(target?.textContent).toBe('你好，勇敢的世界');
    // 位于段落末尾，即原文下方
    expect(paragraph?.lastElementChild).toBe(target);
  });

  it('译文独占一行，显示在原文下方', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const block = firstBlock();

    renderTranslation(block, '你好，世界');

    const target = document.body.querySelector<HTMLElement>(`.${TARGET_CLASS}`);
    expect(target?.style.display).toBe('block');
  });

  it('已翻译的块被标记，提取器不再重复提取', () => {
    document.body.innerHTML = '<p>Hello world</p><p>Second line</p>';
    const block = firstBlock();

    renderTranslation(block, '你好，世界');

    expect(block.element.hasAttribute('data-ai-translated')).toBe(true);
    expect(extractTextBlocks(document.body).map((b) => b.text)).toEqual(['Second line']);
  });

  it('重复渲染幂等，不叠加译文', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const block = firstBlock();

    renderTranslation(block, '初次译文');
    renderTranslation(block, '更新译文');

    expect(document.body.querySelectorAll(`.${TARGET_CLASS}`)).toHaveLength(1);
    expect(document.body.querySelector(`.${TARGET_CLASS}`)?.textContent).toBe('更新译文');
  });

  it('回退后移除译文，原文与结构原样保留', () => {
    document.body.innerHTML = '<p>Hello <b>brave</b> world</p>';
    const block = firstBlock();

    renderTranslation(block, '你好，勇敢的世界');
    revertTranslation(block);

    expect(document.body.querySelector(`.${TARGET_CLASS}`)).toBeNull();
    expect(document.body.querySelector('b')?.textContent).toBe('brave');
    expect(extractTextBlocks(document.body).map((b) => b.text)).toEqual(['Hello brave world']);
  });

  it('按钮里的译文跟在同一行并加括号，不撑高按钮', () => {
    document.body.innerHTML = '<button>Create new API key</button>';
    const block = firstBlock();

    renderTranslation(block, '创建新的 API 密钥');

    const target = document.body.querySelector<HTMLElement>(`.${TARGET_CLASS}`);
    expect(target?.style.display).toBe('inline');
    expect(target?.textContent).toBe('(创建新的 API 密钥)');
  });

  it('带按钮样式的链接（class 含 btn）同样按紧凑处理', () => {
    document.body.innerHTML = '<a class="btn-primary" href="#">Save changes</a>';
    const block = firstBlock();

    renderTranslation(block, '保存更改');

    const target = document.body.querySelector<HTMLElement>(`.${TARGET_CLASS}`);
    expect(target?.style.display).toBe('inline');
  });

  it('译文带弱化样式，与原文形成层次', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const block = firstBlock();

    renderTranslation(block, '你好，世界');

    const target = document.body.querySelector<HTMLElement>(`.${TARGET_CLASS}`);
    expect(target?.style.fontSize).toBe('0.94em');
    expect(target?.style.opacity).toBe('0.85');
  });

  it('渲染外层块时不会误删内层块的译文', () => {
    document.body.innerHTML = '<div>Outer text<p>Inner text</p></div>';
    const blocks = extractTextBlocks(document.body);
    const outer = blocks.find((b) => b.element.tagName === 'DIV');
    const inner = blocks.find((b) => b.element.tagName === 'P');
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    // 内层先渲染，外层后渲染——外层的清理不能波及内层
    renderTranslation(inner as TextBlock, '内层译文');
    renderTranslation(outer as TextBlock, '外层译文');

    expect(document.body.querySelectorAll(`.${TARGET_CLASS}`)).toHaveLength(2);
    expect(document.body.textContent).toContain('内层译文');
    expect(document.body.textContent).toContain('外层译文');
  });

  it('外层块渲染后，内层块仍被判定为已翻译（补翻能收敛）', () => {
    document.body.innerHTML = '<div>Outer text<p>Inner text</p></div>';
    const blocks = extractTextBlocks(document.body);
    const outer = blocks.find((b) => b.element.tagName === 'DIV') as TextBlock;
    const inner = blocks.find((b) => b.element.tagName === 'P') as TextBlock;

    renderTranslation(inner, '内层译文');
    renderTranslation(outer, '外层译文');

    // 应为空：否则每一轮巡检都会重翻这几个块，永远补不平
    expect(extractTextBlocks(document.body)).toHaveLength(0);
  });
});
