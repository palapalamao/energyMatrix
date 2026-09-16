/**
 * 把 haystack-nclient 的 `Client` 与 haystack-core 的值类型重新导出到一个
 * 稳定路径，Model / Store 只从这里 import。
 *
 * `Client` 已经处理了全部 FIN 通信细节 —— **不要重新实现其中任何一项**：
 *   - SkyArc-Attest-Key 的获取（/finStackAuth）与自动刷新
 *   - session cookie 与 CSRF
 *   - Zinc 请求体 / 响应解析（比 JSON 省体积，且不丢单位与时区）
 *   - ext.eval / ext.evalAll / ext.read / ext.commit
 *
 * 构造点只有一处：src/App.tsx 的 `new Client({...})`（放在 useMemo 里）。
 * 组件一律用 haystack-react 的 `useClient()` 取实例，不要另建单例。
 */
export { Client } from "haystack-nclient";
export type { Client as HClient } from "haystack-nclient";

export {
  HRef,
  HDict,
  HGrid,
  HStr,
  HNum,
  HList,
  HMarker,
  HBool,
  HDateTime,
  HDate,
} from "haystack-core";
export type { HVal, HaysonDict } from "haystack-core";
