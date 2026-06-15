import { pickFk } from "./rooSectionsConfig";

const LS_KEY = "roo-my-trash-factory-v1";

/** Бэкенд MyTrash не возвращает предприятие в JSON — храним связь локально. */
export function readMyTrashFactoryMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "number" && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeMyTrashFactoryLink(
  myTrashId: number,
  factoryId: number | null
): void {
  const map = readMyTrashFactoryMap();
  const key = String(myTrashId);
  if (factoryId != null && factoryId > 0) map[key] = factoryId;
  else delete map[key];
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function applyMyTrashFactoryOverlay(
  row: Record<string, unknown>,
  factories: Record<string, unknown>[]
): Record<string, unknown> {
  const id = row.id_my_trash;
  if (typeof id !== "number") return row;
  if (row.id_magasin_factory && typeof row.id_magasin_factory === "object") return row;
  const fid = readMyTrashFactoryMap()[String(id)];
  if (!fid) return row;
  const factory = factories.find((f) => pickFk(f, "id_magasin_factory") === fid);
  return factory ? { ...row, id_magasin_factory: factory } : row;
}

export function patchMyTrashRowAfterSave(
  prev: Record<string, unknown>,
  updated: Record<string, unknown>,
  factories: Record<string, unknown>[]
): Record<string, unknown> {
  const myTrashId = updated.id_my_trash ?? prev.id_my_trash;
  const factoryId = pickFk(prev.id_magasin_factory, "id_magasin_factory");
  if (typeof myTrashId === "number") {
    if (factoryId > 0) writeMyTrashFactoryLink(myTrashId, factoryId);
    else if (prev.id_magasin_factory === null) writeMyTrashFactoryLink(myTrashId, null);
  }
  let row = applyMyTrashFactoryOverlay(updated, factories);
  if (!row.id_magasin_factory && prev.id_magasin_factory) {
    row = { ...row, id_magasin_factory: prev.id_magasin_factory };
  }
  return row;
}

export function enrichMyTrashRows(
  rows: Record<string, unknown>[],
  factories: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((r) => applyMyTrashFactoryOverlay(r, factories));
}
