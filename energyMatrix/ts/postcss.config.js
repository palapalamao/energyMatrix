// Tailwind v3.4 的 PostCSS 接线。
// 升到 v4 时这里要改成 { '@tailwindcss/postcss': {} } 并升 postcss-loader。
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
