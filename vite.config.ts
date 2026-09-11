import { defineConfig } from 'vitest/config';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      output: {
        // 固定产物文件名（去掉内容 hash）：
        // Chrome 里已加载的扩展记着旧的引用路径，带 hash 的文件名
        // 在重新构建后必然 404（ERR_FILE_NOT_FOUND），
        // 固定名字后重复构建也不会产生悬空引用。
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  // 用 happy-dom 而非 jsdom：jsdom 自带一套跨 realm 的 Uint8Array，
  // 会让 esbuild 的 invariant 校验失败（vitest#4043），导致测试无法启动。
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
