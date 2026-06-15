import { apiDelete, apiGet, apiPost } from "./api";
import { pickFk, type RooCol } from "./rooSectionsConfig";

function phoneUrObMatches(rec: Record<string, unknown>, urOb: 0 | 1): boolean {
  const raw = rec.ur_ob;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return false;
  if (n === 3) return true;
  return urOb === 0 ? n === 0 : n === 1;
}

async function reloadMagasinFactory(factoryId: number): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/api/magasin-factory/${factoryId}`);
}

/** Связи телефонов с предприятием (не FK в теле MagasinFactory). */
export async function handleRooGridRefAction(
  action: "pick" | "clear",
  sectionId: string,
  col: RooCol,
  row: Record<string, unknown>,
  picked?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (sectionId !== "magasin-factory") return null;
  if (col.gridRef !== "numberPhone" || col.phoneUrOb === undefined) return null;

  const factoryId = row.id_magasin_factory;
  if (typeof factoryId !== "number") {
    throw new Error("Сначала сохраните строку предприятия");
  }

  if (action === "pick" && picked) {
    const phoneId = pickFk(picked, "id_phone_number");
    if (phoneId <= 0) throw new Error("Не выбран телефон");
    await apiPost(
      `/api/number-phone-count?objectPlaceId=${factoryId}&phoneId=${phoneId}&urOb=${col.phoneUrOb}`,
      {}
    );
    return reloadMagasinFactory(factoryId);
  }

  if (action === "clear") {
    const phones = Array.isArray(row.phones) ? row.phones : [];
    for (const p of phones) {
      if (!p || typeof p !== "object") continue;
      const rec = p as Record<string, unknown>;
      if (!phoneUrObMatches(rec, col.phoneUrOb)) continue;
      const phoneId = pickFk(rec, "id_phone_number");
      if (phoneId > 0) {
        await apiDelete(
          `/api/number-phone-count/unlink?objectPlaceId=${factoryId}&phoneId=${phoneId}`
        );
      }
    }
    return reloadMagasinFactory(factoryId);
  }

  return null;
}
