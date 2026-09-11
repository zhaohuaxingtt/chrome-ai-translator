import { DEFAULT_SETTINGS, type ExtensionSettings } from '../shared/settings';
import {
  OPEN_OPTIONS_REQUEST,
  TRANSLATE_REQUEST,
  type TranslateRequestMessage,
  type TranslateRequestPayload,
  type TranslateResponse,
} from '../shared/messages';
import { translatePage, type PageContext } from './translate-page';
import { observeMutations } from './mutation-listener';
import { TARGET_CLASS, TRANSLATED_ATTR } from '../shared/translated-mark';
import { isBlockTranslated } from '../core/extractor/block-extractor';
import { createFloatingBall, type FloatingBallHandle } from './floating-ball';

// 启动探针：看到这行说明 Content Script 已成功注入。
// 看不到则问题在扩展加载/注入层，而非翻译逻辑。
console.info(`[AI 实时翻译] Content Script 已注入（${window.location.hostname}）`);

/**
 * Content Script 入口。
 * 只读取翻译所需的非敏感设置（开关 / 目标语言 / 排除站点），
 * 从不读取、也拿不到 API 凭据。
 */
/**
 * 页面侧只读取这些非敏感字段。
 * API 凭据（baseUrl / apiKey / model）刻意不在其中——它们只归 Background 所有，
 * 把安全边界写进类型，避免哪天被顺手加进来。
 */
interface PageSettings {
  enabled: boolean;
  autoTranslate: boolean;
  targetLang: string;
  excludedHosts: string[];
}

async function readSettings(): Promise<PageSettings> {
  const stored = await chrome.storage.sync.get('settings');
  const raw = (stored.settings ?? {}) as Partial<ExtensionSettings>;

  return {
    enabled: raw.enabled ?? DEFAULT_SETTINGS.enabled,
    autoTranslate: raw.autoTranslate ?? DEFAULT_SETTINGS.autoTranslate,
    targetLang: raw.targetLang ?? DEFAULT_SETTINGS.targetLang,
    excludedHosts: raw.excludedHosts ?? DEFAULT_SETTINGS.excludedHosts,
  };
}

async function readContext(): Promise<PageContext> {
  const settings = await readSettings();

  return {
    enabled: settings.enabled,
    targetLang: settings.targetLang,
    excludedHosts: settings.excludedHosts,
  };
}

async function sendTranslateRequest(
  payload: TranslateRequestPayload,
): Promise<TranslateResponse> {
  const message: TranslateRequestMessage = { type: TRANSLATE_REQUEST, payload };
  return chrome.runtime.sendMessage<TranslateRequestMessage, TranslateResponse>(message);
}

/**
 * 等待页面完全加载（SSR 框架的水合大多发生在 load 事件附近）。
 * 必须带超时兜底：慢资源会让 load 拖很久甚至不触发，
 * 那时翻译会一直不开始、页面上一点动静都没有。
 */
function waitForWindowLoad(timeoutMs = 5000): Promise<void> {
  if (document.readyState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    window.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

// 延迟开始翻译：给 React/Vue 等框架的水合留出时间。
// 若在水合完成前插入译文，框架会因 DOM 与预期不符而报错并重建页面，
// 我们插入的译文也会随之被清掉（表现为 React error #418）。
const HYDRATION_GRACE_MS = 1500;

/** 最近一次成功渲染的块数，供健康自检判断译文是否被整体清除 */
let lastRenderedCount = 0;

/**
 * 本页是否已开启翻译（运行时状态，刷新后重置）。
 * 默认跟随设置的 autoTranslate；为 false 时页面保持原文，
 * 由悬浮球手动开启后才翻译。
 */
let pageTranslationEnabled = false;

/** 本页当前是否已渲染出译文 */
let pageTranslated = false;

/** 悬浮球句柄（插件关闭时不创建） */
let ball: FloatingBallHandle | undefined;

function togglePageTranslation(): void {
  if (pageTranslated) {
    disablePageTranslation();
    return;
  }
  enablePageTranslation();
}

/** 供悬浮球调用：开启本页翻译 */
export function enablePageTranslation(): void {
  pageTranslationEnabled = true;
  void runTranslateGuarded();
}

/** 供悬浮球调用：关闭本页翻译并移除已渲染的译文 */
export function disablePageTranslation(): void {
  pageTranslationEnabled = false;
  pageTranslated = false;

  // 移除本页所有译文，页面恢复原文（原文节点从未被改写，所以删掉译文即可）
  for (const element of document.querySelectorAll(`[${TRANSLATED_ATTR}]`)) {
    element.removeAttribute(TRANSLATED_ATTR);
  }
  for (const target of document.querySelectorAll(`.${TARGET_CLASS}`)) {
    target.remove();
  }

  lastRenderedCount = 0;
  ball?.setTranslated(false);
}

/** 创建悬浮球——按需模式下的主要入口 */
function setupFloatingBall(): void {
  ball = createFloatingBall({
    root: document.body,
    onToggleTranslate: togglePageTranslation,
    onOpenSettings: () => {
      // Content Script 无法直接调用 openOptionsPage（其可用 API 子集里没有），
      // 请 Background 代劳
      void chrome.runtime.sendMessage({ type: OPEN_OPTIONS_REQUEST });
    },
    onHide: () => {
      ball?.destroy();
      ball = undefined;
    },
  });
}

/**
 * 带重入保护的整页翻译。
 * 每次执行都动态取当前 document.body——SPA 框架可能替换整个 body。
 */
async function runTranslate(): Promise<void> {
  ball?.setBusy(true);

  try {
    await translatePage({
      root: document.body,
      hostname: window.location.hostname,
      getContext: readContext,
      sendTranslateRequest,
    });

    // 基线取「页面实际存在的译文节点数」，而非本轮的渲染调用次数：
    // 两者口径不同（同一个元素可能承载多个块），用调用次数会让自检永远判定缺译文。
    const alive = document.querySelectorAll(`.${TARGET_CLASS}`).length;
    if (alive > 0) {
      lastRenderedCount = alive;
      pageTranslated = true;
      // 重新进入勤查节奏：刚翻译完的这段时间最容易出问题
      healthyChecks = 0;
    }
  } finally {
    ball?.setBusy(false);
    ball?.setTranslated(pageTranslated);
  }
}

let running = false;
let pending = false;
let stopped = false;
let healthCheckTimer: ReturnType<typeof setTimeout> | undefined;
let healthyChecks = 0;
let observer: MutationObserver | undefined;

/**
 * 扩展被重新加载/更新后，页面上这个「旧」content script 手里的 chrome API 会失效，
 * 抛出 "Extension context invalidated"。这种状态无法恢复，只能停下——
 * 否则自检循环会每 3 秒报一次同样的错。
 */
function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && /extension context invalidated/i.test(error.message);
}

/** 停止本页的所有定时任务与监听 */
function shutdown(): void {
  stopped = true;

  if (healthCheckTimer !== undefined) {
    clearTimeout(healthCheckTimer);
    healthCheckTimer = undefined;
  }

  observer?.disconnect();
  observer = undefined;

  console.info('[AI 实时翻译] 扩展已更新，本页翻译停止。刷新页面即可恢复。');
}

/** 执行期间又有新变化时，跑完当前这轮再补一轮，避免并发重复渲染 */
async function runTranslateGuarded(): Promise<void> {
  if (stopped || !pageTranslationEnabled) {
    return;
  }

  if (running) {
    pending = true;
    return;
  }

  running = true;
  try {
    await runTranslate();
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      shutdown();
      return;
    }
    throw error;
  } finally {
    running = false;
    if (pending && !stopped) {
      pending = false;
      void runTranslateGuarded();
    }
  }
}

function onMutations(): void {
  console.info('[AI 实时翻译] 检测到页面变化，重新检查待译内容');
  void runTranslateGuarded();
}

/**
 * 健康自检兜底。
 *
 * React/Vue 重渲染会清掉我们插入的译文节点（框架只认自己虚拟 DOM 里的节点），
 * 但容器上的 data-ai-translated 标记会留下——于是「有标记、没译文」。
 * MutationObserver 未必能捕获这类重建，故按间隔主动巡检：
 * 只要存在「有标记但译文丢失」的块，或译文数量少于基线，就补翻
 * （补翻走缓存，近乎零成本，且渲染是幂等的）。
 *
 * 用递归 setTimeout 而非 setInterval：译文稳定后自动拉长间隔，
 * 避免页面长期驻留时反复空转自检。
 */
const HEALTH_CHECK_INTERVAL_MS = 3000;
const HEALTH_CHECK_IDLE_INTERVAL_MS = 30_000;

/** 连续这么多次巡检都无异常，就认为译文已稳定 */
const HEALTHY_CHECKS_BEFORE_IDLE = 3;

/** 统计「已标记但译文丢失」的块数量 */
function countStaleTranslatedBlocks(): number {
  let stale = 0;

  for (const element of document.querySelectorAll(`[${TRANSLATED_ATTR}]`)) {
    if (!isBlockTranslated(element)) {
      stale += 1;
    }
  }

  return stale;
}

function scheduleHealthCheck(delayMs: number): void {
  healthCheckTimer = setTimeout(() => {
    healthCheckTimer = undefined;

    if (stopped) {
      return;
    }

    if (lastRenderedCount === 0) {
      scheduleHealthCheck(HEALTH_CHECK_INTERVAL_MS);
      return;
    }

    const alive = document.querySelectorAll(`.${TARGET_CLASS}`).length;
    const stale = countStaleTranslatedBlocks();

    if (stale > 0 || alive < lastRenderedCount) {
      healthyChecks = 0;
      console.info(
        `[AI 实时翻译] 检测到译文缺失（现存 ${alive} / 已渲染 ${lastRenderedCount}），自动补翻`,
      );
      void runTranslateGuarded();
      scheduleHealthCheck(HEALTH_CHECK_INTERVAL_MS);
      return;
    }

    healthyChecks += 1;
    scheduleHealthCheck(
      healthyChecks >= HEALTHY_CHECKS_BEFORE_IDLE
        ? HEALTH_CHECK_IDLE_INTERVAL_MS
        : HEALTH_CHECK_INTERVAL_MS,
    );
  }, delayMs);
}

void waitForWindowLoad()
  .then(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, HYDRATION_GRACE_MS);
      }),
  )
  .then(async () => {
    // 监听必须在翻译开始「之前」挂上：SPA 框架可能在翻译进行中重建页面，
    // 如果等到翻译完成才挂监听，那次重建中丢失的译文就永远没人补了。
    // 挂在 document（浏览器层的根）而非 body/documentElement：
    // 框架无论怎么重建 body 甚至 html，都不会让这个监听失效。
    observer = observeMutations(document, onMutations);
    scheduleHealthCheck(HEALTH_CHECK_INTERVAL_MS);

    const settings = await readSettings();

    // 插件关闭：连悬浮球都不显示
    if (!settings.enabled) {
      return undefined;
    }

    setupFloatingBall();

    pageTranslationEnabled = settings.autoTranslate;

    // 按需模式（默认）：页面保持原文，等用户点悬浮球触发
    if (pageTranslationEnabled) {
      return runTranslateGuarded();
    }
    return undefined;
  })
  .catch((error: unknown) => {
    if (isExtensionContextInvalidated(error)) {
      shutdown();
      return;
    }
    console.error('[AI 实时翻译] 整页翻译失败：', error);
  });
