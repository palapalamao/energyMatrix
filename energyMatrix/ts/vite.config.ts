import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * energyMatrix HMI 的 Vite SPA 构建。
 *
 * 产物落 ../res/web/em/，由 build.fan 的 resDirs 打包进 pod；
 * finBuild 在 Fantom 编译**之前**跑这里的 `npm run build`（build.fan 的
 * nodeDirs = [`ts/`]）。目录布局按 docs/fin/09-frontend-ts-vite.md：
 *   index.html → main.tsx → App.tsx → routes.tsx → pages/*
 *
 * 下面四项配置每一项都对应一个踩过的坑，改之前先看注释。
 */
export default defineConfig({
  // 相对 base —— FIN 从 pod 根路径 /pod/energyMatrix/res/web/em/ 提供服务，
  // 绝对资源 URL 会 404。
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: "../res/web/em",
    emptyOutDir: true,
    // 生产构建不出 sourcemap：它比 bundle 本身还大（2MB+），会把 pod 撑起来，
    // 而且 pod 是要发到客户现场的，.map 等于把全部源码一起发过去。
    // 本地排查时临时改成 true 即可。
    sourcemap: false,
    // 拍平资源目录：build.fan 的 resDirs **不递归**，多一层子目录就打不进 pod。
    assetsDir: ".",
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
      output: {
        // 内容哈希文件名，浏览器不会在重新部署后拿到陈旧 bundle。
        // index.html 由 pod 现场提供，指向当前哈希；emptyOutDir 清掉上一版。
        entryFileNames: "em-app-[hash].js",
        chunkFileNames: "em-[name]-[hash].js",
        assetFileNames: "em-app-[hash].[ext]",
      },
    },
  },
  server: {
    port: 8083,
    // 独立开发时把 Folio / Axon 调用代理到本地 FIN 实例。
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true, secure: false },
      "/finStackAuth": { target: "http://localhost:8080", changeOrigin: true, secure: false },
      "/pod": { target: "http://localhost:8080", changeOrigin: true, secure: false },
      "/user": { target: "http://localhost:8080", changeOrigin: true, secure: false },
    },
  },
});
