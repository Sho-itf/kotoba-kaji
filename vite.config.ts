import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス(/kotoba-kaji/)で配信されるので、相対パスにしておく
  base: "./",
  build: {
    rollupOptions: {
      // 複数ページのビルド:ゲームの画面と、見た目の見本(/design/mihon/。ゲームからはリンクしない)
      input: {
        main: "index.html",
        mihon: "design/mihon/index.html",
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
