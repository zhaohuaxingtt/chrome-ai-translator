import { beforeEach, describe, expect, it } from 'vitest';
import { extractTextBlocks } from '../src/core/extractor/block-extractor';
import { renderTranslation } from '../src/core/renderer/bilingual-renderer';

describe('段落提取器', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function texts(): string[] {
    return extractTextBlocks(document.body).map((block) => block.text);
  }

  it('把块级元素内的文本聚合为一个段落块', () => {
    document.body.innerHTML = '<p>Hello world</p>';

    expect(texts()).toEqual(['Hello world']);
  });

  it('内联元素内的文本并入所属段落块', () => {
    document.body.innerHTML = '<p>Hello <b>brave</b> world</p>';

    expect(texts()).toEqual(['Hello brave world']);
  });

  it('多个块级元素产生多个段落块', () => {
    document.body.innerHTML = '<p>Alpha</p><p>Beta</p>';

    expect(texts()).toEqual(['Alpha', 'Beta']);
  });

  it('嵌套块级元素各自成块，不重复包含', () => {
    document.body.innerHTML = '<div><p>Inner one</p><p>Inner two</p></div>';

    expect(texts()).toEqual(['Inner one', 'Inner two']);
  });

  it('跳过脚本、样式、代码块与输入控件', () => {
    document.body.innerHTML = [
      '<script>var x = 1;</script>',
      '<style>.a { color: red }</style>',
      '<pre>code block</pre>',
      '<textarea>input text</textarea>',
      '<code>inlineCode()</code>',
      '<p>Real text</p>',
    ].join('');

    expect(texts()).toEqual(['Real text']);
  });

  it('已翻译的块不再重复提取', () => {
    document.body.innerHTML = '<p>Hello world</p><p>Not yet</p>';
    const blocks = extractTextBlocks(document.body);
    renderTranslation(blocks[0]!, '你好');

    expect(texts()).toEqual(['Not yet']);
  });

  it('同容器内未翻译的兄弟块不受影响', () => {
    document.body.innerHTML = '<div><p>One</p><p>Two</p></div><p>Three</p>';
    const blocks = extractTextBlocks(document.body);
    renderTranslation(blocks[0]!, '一');

    expect(texts()).toEqual(['Two', 'Three']);
  });

  it('过滤空白与过短的文本块', () => {
    document.body.innerHTML = '<p>   </p><p>x</p><p>Real content</p>';

    expect(texts()).toEqual(['Real content']);
  });

  it('每个块带稳定标识，重复提取同一元素 id 不变', () => {
    document.body.innerHTML = '<p>Stable block</p>';

    const first = extractTextBlocks(document.body);
    const second = extractTextBlocks(document.body);

    expect(first[0]?.id).toBeTruthy();
    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it('块记录所含文本节点，供渲染定位插入点', () => {
    document.body.innerHTML = '<p>Hello <b>brave</b> world</p>';

    const blocks = extractTextBlocks(document.body);

    expect(blocks[0]?.nodes).toHaveLength(3);
  });

  it('有已译标记但译文丢失时自愈，重新参与提取', () => {
    document.body.innerHTML = '<p data-ai-translated="true">Hello world</p>';

    expect(extractTextBlocks(document.body).map((b) => b.text)).toEqual(['Hello world']);
  });

  it('有已译标记且译文仍在时不重复提取', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const blocks = extractTextBlocks(document.body);
    renderTranslation(blocks[0]!, '你好');

    expect(extractTextBlocks(document.body)).toHaveLength(0);
  });
});
