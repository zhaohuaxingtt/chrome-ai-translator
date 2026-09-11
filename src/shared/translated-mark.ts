/**
 * 「已翻译」相关的 DOM 标记，提取器与渲染器共用，
 * 保证两边永远说同一套暗号。
 */

/** 打在段落块容器上：整块已被翻译，提取器跳过 */
export const TRANSLATED_ATTR = 'data-ai-translated';

/** 译文节点的 class，用于识别「标记还在但译文被框架清掉」的自愈场景 */
export const TARGET_CLASS = 'ai-tr-target';

/**
 * 译文节点上记录的「所属块 id」。
 * 有了它才能精确回答「这个块自己是否已有译文」——
 * 只靠子树里找 class 会误判：大容器里只要残留任意一个译文，
 * 就会被当成整棵子树都已翻译。
 */
export const TARGET_FOR_ATTR = 'data-ai-target';
