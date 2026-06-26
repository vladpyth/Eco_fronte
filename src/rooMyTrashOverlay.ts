import { pickFk } from "./rooSectionsConfig";

function readMyTrashFactoryMap(lsKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(lsKey);
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

function writeMyTrashFactoryLink(
  lsKey: string,
  myTrashId: number,
  factoryId: number | null
): void {
  const map = readMyTrashFactoryMap(lsKey);
  const key = String(myTrashId);
  if (factoryId != null && factoryId > 0) map[key] = factoryId;
  else delete map[key];
  try {
    localStorage.setItem(lsKey, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function applyMyTrashFactoryOverlay(
  lsKey: string,
  row: Record<string, unknown>,
  factories: Record<string, unknown>[]
): Record<string, unknown> {
  const id = row.id_my_trash;
  if (typeof id !== "number") return row;
  if (row.id_magasin_factory && typeof row.id_magasin_factory === "object") return row;
  const fid = readMyTrashFactoryMap(lsKey)[String(id)];
  if (!fid) return row;
  const factory = factories.find((f) => pickFk(f, "id_magasin_factory") === fid);
  return factory ? { ...row, id_magasin_factory: factory } : row;
}

export function createMyTrashOverlay(lsKey: string) {
  return {
    patchMyTrashRowAfterSave(
      prev: Record<string, unknown>,
      updated: Record<string, unknown>,
      factories: Record<string, unknown>[]
    ): Record<string, unknown> {
      const myTrashId = updated.id_my_trash ?? prev.id_my_trash;
      const factoryId = pickFk(prev.id_magasin_factory, "id_magasin_factory");
      if (typeof myTrashId === "number") {
        if (factoryId > 0) writeMyTrashFactoryLink(lsKey, myTrashId, factoryId);
        else if (prev.id_magasin_factory === null) writeMyTrashFactoryLink(lsKey, myTrashId, null);
      }
      let row = applyMyTrashFactoryOverlay(lsKey, updated, factories);
      if (!row.id_magasin_factory && prev.id_magasin_factory) {
        row = { ...row, id_magasin_factory: prev.id_magasin_factory };
      }
      return row;
    },
    enrichMyTrashRows(
      rows: Record<string, unknown>[],
      factories: Record<string, unknown>[]
    ): Record<string, unknown>[] {
      return rows.map((r) => applyMyTrashFactoryOverlay(lsKey, r, factories));
    },
  };
}

/** Бэкенд MyTrash не возвращает предприятие в JSON — храним связь локально (РОО). */
const DEFAULT_LS_KEY = "roo-my-trash-factory-v1";
const defaultOverlay = createMyTrashOverlay(DEFAULT_LS_KEY);

export const enrichMyTrashRows = defaultOverlay.enrichMyTrashRows;
export const patchMyTrashRowAfterSave = defaultOverlay.patchMyTrashRowAfterSave;
