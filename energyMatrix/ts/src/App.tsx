import { useMemo } from "react";
import { Outlet, useParams } from "react-router-dom";
import { ClientContext } from "haystack-react";
import { Client } from "@/api/client";
import { I18NProvider } from "@/i18n/I18NProvider";
import { AppShell } from "@/components/AppShell";
import { SiteProvider } from "@/components/SiteContext";
import { resolveClientBase } from "@/appRuntime";
import { resolveProjectName } from "@/projectName";

/**
 * Provider 树 + 全局框架。
 *
 * Client 在这里构造，且只构造这一次：它自己处理 SkyArc-Attest-Key、
 * session cookie、CSRF 与 Zinc 编解码。**绝不要手写 fetch('/api/{proj}/eval')**
 * —— troxEquipment 当初就是靠删掉那 150 行手搓 auth 才稳定下来的。
 *
 * `accept: text/zinc` 是必须的：JSON 会丢单位、时区与列 meta，
 * 而能耗账目里的单位（kWh / m³ / kg）恰恰不能丢。
 */
export function App() {
  const projectName = useProjectName();

  const client = useMemo(
    () =>
      new Client({
        base: resolveClientBase(window.location),
        project: projectName,
        options: { headers: { accept: "text/zinc" } },
      }),
    [projectName]
  );

  return (
    <ClientContext.Provider value={client}>
      <I18NProvider>
        <SiteProvider>
          <AppShell>
            <Outlet />
          </AppShell>
        </SiteProvider>
      </I18NProvider>
    </ClientContext.Provider>
  );
}

/**
 * 解析当前 FIN 项目名。
 *
 * 顺序：路由参数 → Vite 开发环境变量 → FIN 外壳（window.top 上的
 * finstack）→ URL 里的 /api/<project>/ 段 → sys。开发环境变量只在
 * import.meta.env.DEV 为 true 时生效，不会覆盖生产 FIN 项目。
 */
function useProjectName(): string {
  const { projectName } = useParams();
  return resolveProjectName({
    routeProject: projectName,
    devProject: import.meta.env.VITE_FIN_PROJECT,
    isDev: import.meta.env.DEV,
    shellProject: readShellProject(),
    pathname: window.location.pathname,
  });
}

function readShellProject(): string | undefined {
  try {
    // window.parent 只上一层；FIN 外壳可能嵌套多层 iframe，要用 window.top。
    const top = window.top as unknown as
      | { finstack?: { projectName?: string }; fin5Top?: { finstack?: { projectName?: string } } }
      | undefined;
    return top?.finstack?.projectName ?? top?.fin5Top?.finstack?.projectName;
  } catch {
    // 跨域 iframe 访问 window.top 会抛 —— 静默回退到下一级解析。
    return undefined;
  }
}
