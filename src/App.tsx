import { useCallback, useEffect, useState } from "react";
import {
  APP_MODULE_META,
  loadAppModule,
  saveAppModule,
  type AppModule,
} from "./appModules";
import { setApiModule } from "./apiModule";
import { RhzoApp } from "./RhzoApp";
import { RooApp } from "./RooApp";
import "./App.css";

export default function App() {
  const [module, setModuleState] = useState<AppModule>(loadAppModule);

  const setModule = useCallback((next: AppModule) => {
    setModuleState(next);
    saveAppModule(next);
    setApiModule(next);
  }, []);

  useEffect(() => {
    setApiModule(module);
  }, [module]);

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
      {module === "rhzo" ? <RhzoApp /> : <RooApp />}
    </div>
  );
}
