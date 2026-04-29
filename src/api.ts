/** Пусто = относительный URL (тот же хост; nginx должен проксировать /api на Spring). Иначе полный URL бэкенда, например http://api.example.com:8080 */
const RAW_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = RAW_BASE ? RAW_BASE.replace(/\/$/, "") : "";

function looksLikeHtml(t: string): boolean {
  const s = t.trimStart();
  return s.startsWith("<!") || s.startsWith("<html");
}

async function readBodyAsText(res: Response): Promise<string> {
  return res.text();
}

async function parseErrorMessage(res: Response, text: string): Promise<string> {
  if (looksLikeHtml(text)) {
    return `${res.status} ${res.statusText}: получен HTML вместо JSON. Настройте прокси location /api в nginx на контейнер Spring или задайте VITE_API_BASE_URL при сборке фронта.`;
  }
  try {
    const j = JSON.parse(text) as {
      message?: string;
      detail?: string;
      title?: string;
      errors?: Array<{ field?: string; defaultMessage?: string; message?: string }>;
      violations?: Array<{ field?: string; message?: string; propertyPath?: string }>;
    };
    if (Array.isArray(j.errors) && j.errors.length > 0) {
      const parts = j.errors.map((e) => {
        const f = e.field ?? "";
        const m = e.defaultMessage ?? e.message ?? "";
        return f ? `${f}: ${m}` : m;
      });
      const joined = parts.filter(Boolean).join("; ");
      if (joined) return joined;
    }
    if (Array.isArray(j.violations) && j.violations.length > 0) {
      const parts = j.violations.map((v) => {
        const f = v.field ?? v.propertyPath ?? "";
        const m = v.message ?? "";
        return f ? `${f}: ${m}` : m;
      });
      const joined = parts.filter(Boolean).join("; ");
      if (joined) return joined;
    }
    return j.detail ?? j.message ?? j.title ?? (text || res.statusText);
  } catch {
    return text || res.statusText;
  }
}

async function parseJsonBody<T>(res: Response, text: string): Promise<T> {
  if (looksLikeHtml(text)) {
    throw new Error(
      "Сервер вернул HTML (часто это index.html SPA), а не JSON. Убедитесь, что запросы /api проксируются на бэкенд (nginx) или задайте VITE_API_BASE_URL на URL Spring Boot."
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Ответ сервера не является корректным JSON.");
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url);
  const text = await readBodyAsText(res);
  if (!res.ok) throw new Error(await parseErrorMessage(res, text));
  return parseJsonBody<T>(res, text);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await readBodyAsText(res);
  if (!res.ok) throw new Error(await parseErrorMessage(res, text));
  return parseJsonBody<T>(res, text);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await readBodyAsText(res);
  if (!res.ok) throw new Error(await parseErrorMessage(res, text));
  return parseJsonBody<T>(res, text);
}

export async function apiDelete(path: string): Promise<void> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { method: "DELETE" });
  const text = await readBodyAsText(res);
  if (!res.ok) throw new Error(await parseErrorMessage(res, text));
}

export function getNestedId(obj: unknown, idField: string): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[idField];
  return typeof v === "number" ? v : undefined;
}

function numOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrEmpty(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Сброс связи на бэкенде: Long null не отличить от «поле не передано», поэтому отправляем -1 */
export const FK_CLEAR = -1;

function fk(
  patch: Record<string, unknown>,
  key: string,
  entity: unknown,
  nestedKey: string
): number | undefined {
  if (Object.prototype.hasOwnProperty.call(patch, key)) {
    const v = patch[key];
    if (v === null || v === undefined || v === "") return FK_CLEAR;
    const n = Number(v);
    if (!Number.isFinite(n)) return FK_CLEAR;
    if (n < 0) return FK_CLEAR;
    return n;
  }
  const cur = getNestedId(entity, nestedKey);
  return cur;
}

function optStr(
  patch: Record<string, unknown>,
  o: Record<string, unknown>,
  key: string
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(patch, key)) {
    return strOrEmpty(patch[key]);
  }
  const v = strOrEmpty(o[key]);
  return v === "" ? undefined : v;
}

/** Площади: пустое поле → 0 (в сущности float) */
function pFloat(
  patch: Record<string, unknown>,
  o: Record<string, unknown>,
  key: string
): number | undefined {
  if (Object.prototype.hasOwnProperty.call(patch, key)) {
    const v = patch[key];
    if (v === null || v === undefined || v === "") return 0;
    const n = parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return numOrUndef(o[key]);
}

/** Год и т.п.: пустое поле → 0 (в сущности int) */
function startUseFromPatchOrRow(
  patch: Record<string, unknown>,
  o: Record<string, unknown>
): number | undefined {
  if (Object.prototype.hasOwnProperty.call(patch, "start_use")) {
    const v = patch.start_use;
    if (v === null || v === undefined || v === "") return 0;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? 0 : n;
  }
  if (o.start_use === null || o.start_use === undefined) return undefined;
  return Number(o.start_use);
}

function dateFromPatchOrRow(
  patch: Record<string, unknown>,
  o: Record<string, unknown>,
  key: string
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(patch, key)) {
    const v = patch[key];
    if (v === null || v === undefined || v === "") return undefined;
    return String(v).slice(0, 10);
  }
  const v = o[key];
  if (v === null || v === undefined || v === "") return undefined;
  return String(v).slice(0, 10);
}

/** Полное тело ObjectPlaceTrashRequest из сущности API (snake_case) + точечные правки */
export function objectPlaceTrashToRequest(
  o: Record<string, unknown>,
  patch: Record<string, unknown> = {}
): Record<string, unknown> {
  const dateRegisterVal = Object.prototype.hasOwnProperty.call(patch, "date_register")
    ? patch.date_register
    : o.date_register;
  const dateStr =
    dateRegisterVal === null || dateRegisterVal === undefined || dateRegisterVal === ""
      ? undefined
      : String(dateRegisterVal).slice(0, 10);

  return {
    idRegistration: strOrEmpty(patch.id_registration ?? o.id_registration),
    register: Number(patch.register ?? o.register ?? 0),
    dateRegister: dateStr,
    citiesId: fk(patch, "citiesId", o.id_cities, "id_cities"),
    regionId: fk(patch, "regionId", o.id_region, "id_region"),
    groupPlaceSaveId: fk(patch, "groupPlaceSaveId", o.id_group_place_save, "id_group_place_save"),
    storageSchemeId: fk(patch, "storageSchemeId", o.id_storage_scheme, "id_storage_scheme"),
    gruopsDegreeId: fk(patch, "gruopsDegreeId", o.id_gruops_degree, "id_gruops_degree"),
    nameObj: strOrEmpty(patch.name_obj ?? o.name_obj),
    nameOwn: strOrEmpty(patch.name_own ?? o.name_own),
    startUse: startUseFromPatchOrRow(patch, o),
    serviseLife: optStr(patch, o, "servise_life"),
    companyLocated: optStr(patch, o, "company_located"),
    payer_indentification_number: optStr(patch, o, "payer_indentification_number"),
    placeObj: optStr(patch, o, "place_obj"),
    project: optStr(patch, o, "project"),
    stateExpertize:
      patch.state_expertize !== undefined
        ? patch.state_expertize === null
          ? undefined
          : Boolean(patch.state_expertize)
        : o.state_expertize === null || o.state_expertize === undefined
          ? undefined
          : Boolean(o.state_expertize),
    ecoPasport: optStr(patch, o, "eco_pasport"),
    pravaPlace: optStr(patch, o, "prava_place"),
    confirmationUse:
      patch.confirmation_use !== undefined
        ? patch.confirmation_use === null
          ? undefined
          : Boolean(patch.confirmation_use)
        : o.confirmation_use === null || o.confirmation_use === undefined
          ? undefined
          : Boolean(o.confirmation_use),
    square: pFloat(patch, o, "square"),
    useSquare: pFloat(patch, o, "use_square"),
    trashSquare: pFloat(patch, o, "trash_square"),
    projectPower: optStr(patch, o, "project_power"),
    facticheskayPower: optStr(patch, o, "facticheskay_power"),
    accomulatedTrash: optStr(patch, o, "accomulated_trash"),
    typeGrounds: optStr(patch, o, "type_grounds"),
    anderWater: optStr(patch, o, "ander_water"),
    observationHole: optStr(patch, o, "observation_hole"),
    dateAxclute: dateFromPatchOrRow(patch, o, "date_axclute"),
    resonAxclute: optStr(patch, o, "reson_axclute"),
    status:
      patch.status !== undefined
        ? patch.status === null
          ? undefined
          : Boolean(patch.status)
        : o.status === null || o.status === undefined
          ? undefined
          : Boolean(o.status),
  };
}

export function formatCity(c: unknown): string {
  if (!c || typeof c !== "object") return "";
  const o = c as Record<string, unknown>;
  const district = o.id_district as Record<string, unknown> | undefined;
  return strOrEmpty(district?.name_district);
}

export function formatGroupPlace(g: unknown): string {
  if (!g || typeof g !== "object") return "";
  const o = g as Record<string, unknown>;
  return strOrEmpty(o.name_group ?? o.name_region);
}

export function formatStorage(s: unknown): string {
  if (!s || typeof s !== "object") return "";
  return strOrEmpty((s as Record<string, unknown>).name_storage_scheme);
}

export function formatDegree(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  const n = (d as Record<string, unknown>).namber_gruop;
  return n === undefined || n === null ? "" : String(n);
}

