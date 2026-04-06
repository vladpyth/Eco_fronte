/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Полный базовый URL API без завершающего слэша, например http://backend:8080 или https://api.example.com */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
