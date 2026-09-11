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
});
