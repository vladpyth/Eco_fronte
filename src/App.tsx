import { useCallback, useState } from "react";
import {
  APP_MODULE_META,
  loadAppModule,
  saveAppModule,
  type AppModule,
} from "./appModules";
import { setApiModule } from "./apiModule";
import { RhzoApp } from "./RhzoApp";
import { RooApp } from "./RooApp";
import { RoioApp } from "./RoioApp";
import "./App.css";

export default function App() {
  const [module, setModuleState] = useState<AppModule>(() => {
    const loaded = loadAppModule();
    setApiModule(loaded);
    return loaded;
  });

  const setModule = useCallback((next: AppModule) => {
    setApiModule(next);
    setModuleState(next);
    saveAppModule(next);
  }, []);

  return (
    <div className="app-shell">
      <nav className="app-module-bar" aria-label="Выбор реестра">
        {(Object.keys(APP_MODULE_META) as AppModule[]).map((id) => {
          const meta = APP_MODULE_META[id];
          const active = module === id;
          return (
            <button
              key={id}
              type="button"
              className={`app-module-btn${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => setModule(id)}
            >
              {meta.label}
            </button>
          );
        })}
      </nav>
      {module === "rhzo" ? <RhzoApp /> : module === "roo" ? <RooApp /> : <RoioApp />}
    </div>
  );
}
