import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス(/kotoba-kaji/)で配信されるので、相対パスにしておく
  base: "./",
  test: { include: ["tests/**/*.test.ts"] },
});
