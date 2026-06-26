export type ApiModule = "rhzo" | "roo" | "roio";

let currentModule: ApiModule = "rhzo";

export function setApiModule(module: ApiModule): void {
  currentModule = module;
}

export function getApiModule(): ApiModule {
  return currentModule;
}

/** /api-poo → РОО (8081), /api-ponod → РОИО (8082), /api → РХЗО (8080). */
export function resolveApiPath(path: string): string {
  if (path.startsWith("http")) return path;
  const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envBase) return `${envBase.replace(/\/$/, "")}${path}`;
  if (path.startsWith("/api/")) {
    if (currentModule === "roo") return `/api-poo${path.slice(4)}`;
    if (currentModule === "roio") return `/api-ponod${path.slice(4)}`;
  }
  return path;
}
