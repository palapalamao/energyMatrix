/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // UI 设计稿的配色（南京奥体中心原型）：侧栏深色 + 绿主色 + 四个功能色。
        // 用语义名而不是十六进制字面量 —— 换主题时只改这里。
        shell: {
          DEFAULT: "#0F1820", // 侧栏 / 大屏底色
          soft: "#16222C",
          line: "#22323F",
        },
        brand: {
          DEFAULT: "#6EB435", // 主色（能耗正常 / 达标）
          soft: "#EAF4E0",
        },
        info: "#138BAA",   // 数据可信度 / 计量
        accent: "#7B61C9", // 碳资产
        warn: "#E89B1A",   // 预警 / 缺口
        danger: "#D94343", // 超限 / 严重异常
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "Consolas", "monospace"],
      },
      fontSize: {
        // 流体字号：大屏（值班）与笔记本（日常巡视）共用一套页面
        fluid: "clamp(0.9rem, calc(0.85rem + 0.25vw), 1rem)",
        "fluid-lg": "clamp(1.1rem, calc(1rem + 0.5vw), 1.6rem)",
        "fluid-xl": "clamp(1.6rem, calc(1.3rem + 1.2vw), 2.8rem)",
      },
      spacing: {
        sidebar: "240px", // 设计稿的左侧导航宽度
      },
      gridTemplateColumns: {
        24: "repeat(24, minmax(0, 1fr))",
      },
    },
  },
  plugins: [],
};
