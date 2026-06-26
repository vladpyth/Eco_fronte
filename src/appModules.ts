export type AppModule = "rhzo" | "roo" | "roio";

export const APP_MODULE_LS = "eco-service-app-module";

export const APP_MODULE_META: Record<
  AppModule,
  { label: string; sidebarTitle: string; pageHint: string }
> = {
  rhzo: {
    label: "РХЗО",
    sidebarTitle: "Реестр хранения и захоронения отходов",
    pageHint: "Объекты размещения отходов и справочники",
  },
  roo: {
    label: "РОО",
    sidebarTitle: "Реестр объектов обращения с отходами",
    pageHint: "Предприятия, отходы, выбросы и справочники",
  },
  roio: {
    label: "РОИО",
    sidebarTitle: "Реестр объектов исключений (обращение с отходами)",
    pageHint: "Исключения: предприятия, отходы, выбросы и справочники",
  },
};

export function loadAppModule(): AppModule {
  try {
    const raw = localStorage.getItem(APP_MODULE_LS);
    if (raw === "rhzo" || raw === "roo" || raw === "roio") return raw;
  } catch {
    /* ignore */
  }
  return "rhzo";
}

export function saveAppModule(module: AppModule): void {
  try {
    localStorage.setItem(APP_MODULE_LS, module);
  } catch {
    /* ignore */
  }
}
