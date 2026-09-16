import { createHashRouter, Navigate } from "react-router-dom";
import { App } from "@/App";
import { OverviewView } from "@/pages/Overview/OverviewView";
import { MeterTreeView } from "@/pages/MeterTree/MeterTreeView";
import { FlowView } from "@/pages/Flow/FlowView";
import { ReportsView } from "@/pages/Reports/ReportsView";
import { ModelView } from "@/pages/Model/ModelView";
import { DevicesView } from "@/pages/Devices/DevicesView";
import { AnalysisView } from "@/pages/Analysis/AnalysisView";
import { PortfolioView } from "@/pages/Portfolio/PortfolioView";
import { QuotaView } from "@/pages/Quota/QuotaView";
import { CarbonView } from "@/pages/Carbon/CarbonView";
import { DiagnosisView } from "@/pages/Diagnosis/DiagnosisView";
import { RealtimeView } from "@/pages/Realtime/RealtimeView";
import { WorkOrderView } from "@/pages/WorkOrder/WorkOrderView";
import { MobileView } from "@/pages/Mobile/MobileView";

/**
 * Hash 路由。
 *
 * 必须是 hash 而不是 browser 路由：FIN 通过 iframe 加载本 SPA
 * （`LoadApplication('…/index.html#/overview')`），history API 在那个上下文里
 * 会把地址改成 FIN 外壳的路径，刷新即 404。
 *
 * 13 条路由与 lib/menu.trio 的深链一一对应 —— 改了这里记得同步改那边，
 * 否则菜单点进来会落到空白页。
 */
export const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },

      // ── 监测运行 ──────────────────────────────────────────
      { path: "overview", element: <OverviewView /> },
      { path: "realtime", element: <RealtimeView /> },
      { path: "workorder", element: <WorkOrderView /> },
      { path: "meter-tree", element: <MeterTreeView /> },
      { path: "flow", element: <FlowView /> },

      // ── 分析优化 ──────────────────────────────────────────
      { path: "analysis", element: <AnalysisView /> },
      { path: "quota", element: <QuotaView /> },
      { path: "diagnosis", element: <DiagnosisView /> },
      { path: "carbon", element: <CarbonView /> },

      // ── 资产与建模 ────────────────────────────────────────
      { path: "model", element: <ModelView /> },
      { path: "devices", element: <DevicesView /> },

      // ── 集团与上报 ────────────────────────────────────────
      { path: "portfolio", element: <PortfolioView /> },
      { path: "reports", element: <ReportsView /> },
      { path: "mobile", element: <MobileView /> },

      // 未知路由回总览，而不是白屏
      { path: "*", element: <Navigate to="/overview" replace /> },
    ],
  },
]);
