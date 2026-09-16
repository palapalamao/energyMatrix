export function resolveClientBase(location: Pick<Location, "origin">): URL {
  return new URL(location.origin + "/");
}

export interface RuntimeEnv {
  DEV?: boolean;
  VITE_FIN_PROJECT?: string;
}

export function resolveProjectName(
  location: Pick<Location, "pathname" | "search" | "hostname" | "port">,
  shellProject?: string,
  env: RuntimeEnv = (import.meta as ImportMeta & { env?: RuntimeEnv }).env ?? {},
): string {
  if (shellProject) return shellProject;

  const explicit = new URLSearchParams(location.search).get("project");
  if (explicit) return explicit;

  const fromApiPath = location.pathname.match(/\/api\/([^/]+)\//);
  if (fromApiPath?.[1]) return fromApiPath[1];

  const fromEnv = env.VITE_FIN_PROJECT?.trim();
  if (env.DEV && fromEnv) return fromEnv;

  if (location.hostname === "localhost" && location.port === "8083") return "mytest";

  return "sys";
}
