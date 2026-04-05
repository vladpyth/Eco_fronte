const BASE = "";

async function parseError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { message?: string };
    return j.message ?? (t || res.statusText);
  } catch {
    return t || res.statusText;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
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

function fk(
  patch: Record<string, unknown>,
  key: string,
  entity: unknown,
  nestedKey: string
): number | undefined {
  if (Object.prototype.hasOwnProperty.call(patch, key)) {
    const v = patch[key];
    if (v === null || v === undefined || v === "") return undefined;
    return Number(v);
  }
  return getNestedId(entity, nestedKey);
}

/** Полное тело ObjectPlaceTrashRequest из сущности API (snake_case) + точечные правки */
export function objectPlaceTrashToRequest(
  o: Record<string, unknown>,
  patch: Record<string, unknown> = {}
): Record<string, unknown> {
  const dateRegister = patch.date_register ?? o.date_register;
  const dateStr =
    dateRegister === null || dateRegister === undefined || dateRegister === ""
      ? undefined
      : String(dateRegister).slice(0, 10);

  return {
    idRegistration: strOrEmpty(patch.id_registration ?? o.id_registration),
    register: Number(patch.register ?? o.register ?? 0),
    dateRegister: dateStr,
    citiesId: fk(patch, "citiesId", o.id_cities, "id_cities"),
    groupPlaceSaveId: fk(patch, "groupPlaceSaveId", o.id_group_place_save, "id_group_place_save"),
    storageSchemeId: fk(patch, "storageSchemeId", o.id_storage_scheme, "id_storage_scheme"),
    gruopsDegreeId: fk(patch, "gruopsDegreeId", o.id_gruops_degree, "id_gruops_degree"),
    commentsOfPlaceId: fk(
      patch,
      "commentsOfPlaceId",
      o.id_comments_of_place,
      "id_comments_of_place"
    ),
    nameObj: strOrEmpty(patch.name_obj ?? o.name_obj),
    nameOwn: strOrEmpty(patch.name_own ?? o.name_own),
    startUse:
      patch.start_use !== undefined
        ? numOrUndef(patch.start_use)
        : o.start_use === null || o.start_use === undefined
          ? undefined
          : Number(o.start_use),
    serviseLife: strOrEmpty(patch.servise_life ?? o.servise_life) || undefined,
    companyLocated: strOrEmpty(patch.company_located ?? o.company_located) || undefined,
    placeObj: strOrEmpty(patch.place_obj ?? o.place_obj) || undefined,
    project: strOrEmpty(patch.project ?? o.project) || undefined,
    stateExpertize:
      patch.state_expertize !== undefined
        ? patch.state_expertize === null
          ? undefined
          : Boolean(patch.state_expertize)
        : o.state_expertize === null || o.state_expertize === undefined
          ? undefined
          : Boolean(o.state_expertize),
    ecoPasport: strOrEmpty(patch.eco_pasport ?? o.eco_pasport) || undefined,
    pravaPlace: strOrEmpty(patch.prava_place ?? o.prava_place) || undefined,
    confirmationUse:
      patch.confirmation_use !== undefined
        ? patch.confirmation_use === null
          ? undefined
          : Boolean(patch.confirmation_use)
        : o.confirmation_use === null || o.confirmation_use === undefined
          ? undefined
          : Boolean(o.confirmation_use),
    square: numOrUndef(patch.square ?? o.square),
    useSquare: numOrUndef(patch.use_square ?? o.use_square),
    trashSquare: numOrUndef(patch.trash_square ?? o.trash_square),
    projectPower: strOrEmpty(patch.project_power ?? o.project_power) || undefined,
    facticheskayPower: strOrEmpty(patch.facticheskay_power ?? o.facticheskay_power) || undefined,
    accomulatedTrash: strOrEmpty(patch.accomulated_trash ?? o.accomulated_trash) || undefined,
    typeGrounds: strOrEmpty(patch.type_grounds ?? o.type_grounds) || undefined,
    anderWater: strOrEmpty(patch.ander_water ?? o.ander_water) || undefined,
    observationHole: strOrEmpty(patch.observation_hole ?? o.observation_hole) || undefined,
    dateAxclute:
      (patch.date_axclute ?? o.date_axclute) === null ||
      (patch.date_axclute ?? o.date_axclute) === undefined ||
      (patch.date_axclute ?? o.date_axclute) === ""
        ? undefined
        : String(patch.date_axclute ?? o.date_axclute).slice(0, 10),
    resonAxclute: strOrEmpty(patch.reson_axclute ?? o.reson_axclute) || undefined,
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
  return `${strOrEmpty(o.index)} ${strOrEmpty(o.district)}`.trim();
}

export function formatGroupPlace(g: unknown): string {
  if (!g || typeof g !== "object") return "";
  return strOrEmpty((g as Record<string, unknown>).name_region);
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

export function formatComment(c: unknown): string {
  if (!c || typeof c !== "object") return "";
  return strOrEmpty((c as Record<string, unknown>).comments);
}
