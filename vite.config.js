import { defineConfig } from 'vite';

// GitHub Pages 프로젝트 페이지(https://jeongph.github.io/szent-istvan-tour/)는 하위 경로에서 열린다.
// 개발 서버는 루트(/)를 그대로 쓴다.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/szent-istvan-tour/' : '/',
  build: { chunkSizeWarningLimit: 1500 },
}));
