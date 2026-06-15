export type ApiModule = "rhzo" | "roo";

let currentModule: ApiModule = "rhzo";

export function setApiModule(module: ApiModule): void {
  currentModule = module;
}

export function getApiModule(): ApiModule {
  return currentModule;
}

/** Префикс /api-poo для бэкенда РОО (порт 8081), /api — для РХЗО (8080). */
export function resolveApiPath(path: string): string {
  if (path.startsWith("http")) return path;
  const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envBase) return `${envBase.replace(/\/$/, "")}${path}`;
  if (currentModule === "roo" && path.startsWith("/api/")) {
    return `/api-poo${path.slice(4)}`;
  }
  return path;
}
