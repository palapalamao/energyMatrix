export interface ProjectNameSources {
  routeProject?: string;
  devProject?: string;
  isDev: boolean;
  shellProject?: string;
  pathname: string;
}

/** Resolve the FIN project without allowing local development config into production. */
export function resolveProjectName({
  routeProject,
  devProject,
  isDev,
  shellProject,
  pathname,
}: ProjectNameSources): string {
  if (routeProject) return routeProject;

  const normalizedDevProject = devProject?.trim();
  if (isDev && normalizedDevProject) return normalizedDevProject;

  if (shellProject) return shellProject;

  const pathProject = pathname.match(/\/api\/([^/]+)\//)?.[1];
  return pathProject ?? "sys";
}
