import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

// 单独导出，便于测试以强类型方式校验 manifest 的字段与权限
export const manifestConfig = {
  manifest_version: 3 as const,
  name: 'AI 实时翻译',
  description: '调用 AI 模型实时翻译网页内容，双语对照展示',
  version: pkg.version,

  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'AI 实时翻译',
  },

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],

  options_page: 'src/options/index.html',

  permissions: ['storage'],

  host_permissions: ['http://*/*', 'https://*/*'],
};

export default defineManifest(manifestConfig);
