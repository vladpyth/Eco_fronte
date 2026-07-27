import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setApiModule } from "./apiModule";
import {
  FK_CLEAR,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  formatCity,
  formatDegree,
  formatGroupPlace,
  formatRegion,
  formatStorage,
  getNestedId,
  objectPlaceTrashToRequest,
} from "./api";
import {
  GRID_SECTION_ORDER,
  OBJECT_SECTION,
  type GridRefKind,
  type GridSectionId,
  type SectionId,
  type SimpleCol,
  getGridDef,
  gridCellValue,
  isGridSection,
  pickFk,
} from "./sectionsConfig";
import { GRID_REF_SPECS } from "./gridRefConfig";
import { ExcludeFilterControl, isExcludedRow } from "./ExcludeFilterControl";
import { IconCard, IconTrash } from "./tableActionIcons";
import {
  OBJECT_COLUMNS,
  OBJECT_TABLE_COLUMNS,
  type ObjectCol,
  type RefKind,
} from "./objectPlaceColumns";
import { GridCardModal } from "./GridCardModal";
import { DateField, toIsoDate } from "./DateField";
import { RhzoObjectHub } from "./RhzoObjectHub";
import "./RoioFactoryHub.css";

const COL_WIDTHS_LS = "eco-service-col-widths";
const DEFAULT_COL_WIDTH = 148;

function IconPencil({ title }: { title?: string }) {
  return (
    <svg
      className="icon-pencil"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {title ? <title>{title}</title> : null}
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function loadColWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_LS);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(p))
      if (typeof v === "number" && v >= 64) out[k] = Math.min(v, 800);
    return out;
  } catch {
    return {};
  }
}

type UiState = {
  searchQuery: string;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
};

type PagePayload<T> = {
  content: T[];
  totalElements: number;
  totalPages?: number;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

const REF_CONFIG: Record<
  RefKind,
  {
    title: string;
    path: string;
    patchKey:
      | "citiesId"
      | "regionId"
      | "groupPlaceSaveId"
      | "storageSchemeId"
      | "gruopsDegreeId"
      | "magazinTrashId";
    display: (row: Record<string, unknown>) => string;
    primaryHeader: string;
  }
> = {
  cities: {
    title: "Города",
    path: "/api/cities",
    patchKey: "citiesId",
    display: (r) => String(r.name_cities ?? ""),
    primaryHeader: "Город",
  },
  region: {
    title: "Области",
    path: "/api/region",
    patchKey: "regionId",
    display: (r) => String(r.name_region ?? ""),
    primaryHeader: "Область",
  },
  group: {
    title: "Группы мест сохранения",
    path: "/api/group-place-save",
    patchKey: "groupPlaceSaveId",
    display: (r) => String(r.name_group ?? r.name_region ?? ""),
    primaryHeader: "Регион (группа)",
  },
  storage: {
    title: "Схемы хранения",
    path: "/api/storage-scheme",
    patchKey: "storageSchemeId",
    display: (r) => String(r.name_storage_scheme ?? ""),
    primaryHeader: "Схема",
  },
  degree: {
    title: "Степени групп",
    path: "/api/gruops-degree",
    patchKey: "gruopsDegreeId",
    display: (r) => String(r.namber_gruop ?? ""),
    primaryHeader: "Номер группы",
  },
  magazin: {
    title: "Справочник отходов",
    path: "/api/magazin-trash",
    patchKey: "magazinTrashId",
    display: (r) =>
      `${String(r.code_trash ?? r.codeTrash ?? "").trim()} — ${String(r.name_trash ?? r.nameTrash ?? "").trim()}`.trim(),
    primaryHeader: "Код — наименование",
  },
};

const OBJECT_BOOL_KEYS = new Set(["status", "state_expertize", "confirmation_use"]);

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Многострочное поле главной таблицы: высота растёт при вводе */
function ObjectCellTextarea({
  rowId,
  colKey,
  value,
  readOnly,
  onCommit,
}: {
  rowId: string | number;
  colKey: string;
  value: string;
  readOnly: boolean;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const adjust = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(26, el.scrollHeight)}px`;
  }, []);
  useEffect(() => {
    setLocal(value);
  }, [value, rowId, colKey]);
  useEffect(() => {
    adjust();
  }, [local, adjust]);
  return (
    <textarea
      ref={taRef}
      className="cell-textarea"
      value={local}
      readOnly={readOnly}
      rows={1}
      onChange={(e) => {
        setLocal(e.target.value);
        requestAnimationFrame(() => adjust());
      }}
      onBlur={() => onCommit(local)}
    />
  );
}

type PhoneKind = "legal" | "owner";

function phoneKindMatches(rec: Record<string, unknown>, kind: PhoneKind): boolean {
  const raw = rec.ur_ob;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return false;
  if (n === 3) return true;
  return kind === "legal" ? n === 0 : n === 1;
}

function formatPhonesByKind(row: Record<string, unknown>, kind: PhoneKind): string {
  const p = row.phones;
  if (!Array.isArray(p) || p.length === 0) return "";
  return p
    .filter((x) => x && typeof x === "object" && phoneKindMatches(x as Record<string, unknown>, kind))
    .map((x) => str((x as Record<string, unknown>).number))
    .filter(Boolean)
    .join(", ");
}

function resolvePhoneStatusForNumber(
  row: Record<string, unknown>,
  phoneNumber: string,
  targetKind: PhoneKind
): 0 | 1 | 3 {
  const normalized = phoneNumber.trim();
  if (!normalized) return targetKind === "legal" ? 0 : 1;
  const phones = Array.isArray(row.phones) ? row.phones : [];
  const hasLegal = phones.some((p) => {
    if (!p || typeof p !== "object") return false;
    const rec = p as Record<string, unknown>;
    return String(rec.number ?? "").trim() === normalized && phoneKindMatches(rec, "legal");
  });
  const hasOwner = phones.some((p) => {
    if (!p || typeof p !== "object") return false;
    const rec = p as Record<string, unknown>;
    return String(rec.number ?? "").trim() === normalized && phoneKindMatches(rec, "owner");
  });
  if ((targetKind === "legal" && hasOwner) || (targetKind === "owner" && hasLegal)) return 3;
  return targetKind === "legal" ? 0 : 1;
}

function formatNameList(row: Record<string, unknown>, keyCandidates: string[]): string {
  let arr: unknown = undefined;
  for (const k of keyCandidates) {
    if (Array.isArray(row[k])) {
      arr = row[k];
      break;
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr
    .map((x) => {
      if (!x || typeof x !== "object") return "";
      const o = x as Record<string, unknown>;
      return str(o.name ?? o.name_object ?? o.registr_number);
    })
    .filter(Boolean)
    .join(", ");
}

/** ID объекта из поля CharacteristicTrash.id_object_place_trash (число или вложенный ObjectPlaceTrash). */
function characteristicObjectPlaceId(c: Record<string, unknown>): number | undefined {
  const v = c.id_object_place_trash ?? c.idObjectPlaceTrash;
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const id = o.id_object_place_trash ?? o.idObjectPlaceTrash;
    if (typeof id === "number") return id;
  }
  return undefined;
}

function magazinFromCharacteristic(c: Record<string, unknown>): Record<string, unknown> | undefined {
  const m = c.id_magazin_trash ?? c.idMagazinTrash;
  if (m && typeof m === "object") return m as Record<string, unknown>;
  return undefined;
}

function characteristicMagazinId(c: Record<string, unknown>): number | undefined {
  const v = c.id_magazin_trash ?? c.idMagazinTrash;
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (
      getNestedId(v, "id_magazin_trash") ??
      (typeof o.idMagazinTrash === "number" ? o.idMagazinTrash : undefined)
    );
  }
  return undefined;
}

function characteristicTrashRowId(c: Record<string, unknown>): number | undefined {
  const v = c.id_characteristic_trash ?? c.idCharacteristicTrash;
  return typeof v === "number" ? v : undefined;
}

/** Код и наименование отхода из CharacteristicTrash + MagazinTrash (реестр — поле register в ObjectPlaceTrash). */
function mergeCharacteristicsIntoObjectRows(
  rows: Record<string, unknown>[],
  characteristics: Record<string, unknown>[]
): Record<string, unknown>[] {
  const byObject = new Map<number, Record<string, unknown>[]>();
  for (const c of characteristics) {
    const oid = characteristicObjectPlaceId(c);
    if (oid === undefined) continue;
    const list = byObject.get(oid) ?? [];
    list.push(c);
    byObject.set(oid, list);
  }
  return rows.map((row) => {
    const id = row.id_object_place_trash;
    if (typeof id !== "number") return row;
    const chars = byObject.get(id) ?? [];
    const codes: string[] = [];
    const names: string[] = [];
    for (const ch of chars) {
      const mag = magazinFromCharacteristic(ch);
      if (mag) {
        const code = mag.code_trash ?? mag.codeTrash;
        const name = mag.name_trash ?? mag.nameTrash;
        if (code !== null && code !== undefined && String(code).trim() !== "")
          codes.push(String(code));
        if (name !== null && name !== undefined && String(name).trim() !== "")
          names.push(String(name));
      }
    }
    return {
      ...row,
      __code_trash: [...new Set(codes)].join(", "),
      __name_trash: [...new Set(names)].join(", "),
    };
  });
}

function getObjectCellValue(row: Record<string, unknown>, key: string): string {
  switch (key) {
    case "__region": {
      const city =
        row.id_cities && typeof row.id_cities === "object"
          ? (row.id_cities as Record<string, unknown>)
          : null;
      const regionFromCity = city?.id_region;
      return formatRegion(row.id_region ?? regionFromCity);
    }
    case "__city":
      return formatCity(row.id_cities);
    case "__group":
      return formatGroupPlace(row.id_group_place_save);
    case "__storage":
      return formatStorage(row.id_storage_scheme);
    case "__degree":
      return formatDegree(row.id_gruops_degree);
    case "__phones":
      return formatPhonesByKind(row, "legal");
    case "__phones_owner":
      return formatPhonesByKind(row, "owner");
    case "__around":
      return formatNameList(row, ["aroundBuilds", "around_builds", "aroundBuildList"]);
    case "__natural":
      return formatNameList(row, [
        "naturalSaveBuildings",
        "natualSaveBuildings",
        "natural_save_buildings",
      ]);
    default:
      if (OBJECT_BOOL_KEYS.has(key))
        return row[key] === true ? "Да" : row[key] === false ? "Нет" : "";
      return str(row[key]);
  }
}

function resolveObjectRegionId(row: Record<string, unknown>): number | undefined {
  const regionRaw = row.id_region;
  const direct =
    typeof regionRaw === "number"
      ? regionRaw
      : getNestedId(regionRaw, "id_region") ?? getNestedId(regionRaw, "idRegion");
  if (typeof direct === "number") return direct;
  const cityRaw = row.id_cities;
  return (
    (typeof cityRaw === "object" && cityRaw
      ? getNestedId((cityRaw as Record<string, unknown>).id_region, "id_region") ??
        getNestedId((cityRaw as Record<string, unknown>).id_region, "idRegion")
      : undefined) ?? undefined
  );
}

function cityMatchesRegion(city: Record<string, unknown>, regionId: number | undefined): boolean {
  if (typeof regionId !== "number") return true;
  const raw = city.id_region;
  const cityRegionId =
    typeof raw === "number"
      ? raw
      : getNestedId(raw, "id_region") ?? getNestedId(raw, "idRegion");
  return cityRegionId === regionId;
}

/** Индекс строки в refModal / pickRef для формы создания объекта (ещё нет в таблице). */
const OBJECT_CREATE_ROW_INDEX = -1;

function refKindToObjectField(kind: RefKind): string {
  switch (kind) {
    case "cities":
      return "id_cities";
    case "region":
      return "id_region";
    case "group":
      return "id_group_place_save";
    case "storage":
      return "id_storage_scheme";
    case "degree":
      return "id_gruops_degree";
    default:
      return "";
  }
}

function refKindIdField(kind: RefKind): string {
  switch (kind) {
    case "cities":
      return "id_cities";
    case "region":
      return "id_region";
    case "group":
      return "id_group_place_save";
    case "storage":
      return "id_storage_scheme";
    case "degree":
      return "id_gruops_degree";
    case "magazin":
      return "id_magazin_trash";
    default:
      return "id";
  }
}

function buildNewObjectDraft(rows: Record<string, unknown>[]): Record<string, unknown> {
  const maxReg = rows.reduce((m, r) => {
    const v = r.register;
    return typeof v === "number" && v > m ? v : m;
  }, 0);
  const stamp = Date.now() % 1e7;
  return {
    id_registration: `R${stamp}`.slice(0, 10),
    register: maxReg + 1,
    name_obj: "",
    name_own: "",
    status: false,
    phones: [],
    aroundBuilds: [],
    naturalSaveBuildings: [],
    __draftMagazin: [],
  };
}

function enrichCreateDraftForDisplay(draft: Record<string, unknown>): Record<string, unknown> {
  const magazin = Array.isArray(draft.__draftMagazin)
    ? (draft.__draftMagazin as Record<string, unknown>[])
    : [];
  const codes: string[] = [];
  const names: string[] = [];
  for (const mag of magazin) {
    const code = mag.code_trash ?? mag.codeTrash;
    const name = mag.name_trash ?? mag.nameTrash;
    if (code !== null && code !== undefined && String(code).trim() !== "")
      codes.push(String(code));
    if (name !== null && name !== undefined && String(name).trim() !== "")
      names.push(String(name));
  }
  return {
    ...draft,
    phones: Array.isArray(draft.phones) ? draft.phones : [],
    aroundBuilds: Array.isArray(draft.aroundBuilds) ? draft.aroundBuilds : [],
    naturalSaveBuildings: Array.isArray(draft.naturalSaveBuildings)
      ? draft.naturalSaveBuildings
      : [],
    __code_trash: [...new Set(codes)].join(", "),
    __name_trash: [...new Set(names)].join(", "),
  };
}

function draftRelationKey(
  kind: "around" | "natural"
): "aroundBuilds" | "naturalSaveBuildings" {
  return kind === "around" ? "aroundBuilds" : "naturalSaveBuildings";
}

function buildObjectFieldPatch(
  row: Record<string, unknown>,
  key: string,
  raw: string,
  type?: ObjectCol["type"]
): Record<string, unknown> | null {
  let patch: Record<string, unknown> = {};
  if (type === "number") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (key === "register") return null;
      patch[key] = null;
    } else {
      const n = parseInt(trimmed, 10);
      patch[key] = Number.isNaN(n) ? row[key] : n;
    }
  } else if (type === "float") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      patch[key] = null;
    } else {
      const n = parseFloat(raw.replace(",", "."));
      patch[key] = Number.isNaN(n) ? row[key] : n;
    }
  } else if (type === "bool") {
    patch[key] = raw === "Да" || raw === "true" || raw === "1";
  } else if (type === "date") {
    const t = raw.trim();
    if (t === "") patch[key] = null;
    else patch[key] = toIsoDate(t) || t;
  } else {
    patch[key] = raw;
  }
  const prevStr = getObjectCellValue(row, key);
  if (type === "bool") {
    const prevBool = row[key] === true ? "Да" : row[key] === false ? "Нет" : "";
    if (raw === prevBool) return null;
  } else if (str(patch[key]) === prevStr) {
    if (type !== "number" && type !== "date" && type !== "float") return null;
  }
  return patch;
}

const GRID_CARD_SECTIONS = new Set<GridSectionId>([
  "magazin-trash",
  "characteristic-trash",
]);

function hasGridCard(sid: GridSectionId): boolean {
  return GRID_CARD_SECTIONS.has(sid);
}

function apiPathForSection(s: SectionId): string {
  if (s === "objects") return "/api/object-place-trash";
  return getGridDef(s).apiPath;
}

function idFieldForSection(s: SectionId): string {
  if (s === "objects") return "id_object_place_trash";
  return getGridDef(s).idField;
}

function gridInputDefault(row: Record<string, unknown>, col: SimpleCol): string {
  if (col.gridRef) return "";
  if (col.readOnly) return "";
  const v = row[col.key];
  if (v === undefined || v === null) {
    if (col.type === "number" || col.type === "float") return "";
  }
  if (
    (col.type === "number" || col.type === "float") &&
    v !== null &&
    v !== undefined &&
    typeof v === "object"
  ) {
    return String(pickFk(v, col.key));
  }
  return gridCellValue(row, col, undefined);
}

function parseGridInput(
  raw: string,
  col: SimpleCol,
  row: Record<string, unknown>
): unknown {
  if (col.type === "number") {
    const t = raw.trim();
    if (t === "") return null;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? row[col.key] : n;
  }
  if (col.type === "float") {
    const t = raw.trim();
    if (t === "") return null;
    const n = parseFloat(raw.replace(",", "."));
    return Number.isNaN(n) ? row[col.key] : n;
  }
  if (col.type === "bool") {
    return raw === "Да" || raw === "true" || raw === "1";
  }
  if (col.type === "date") {
    const t = raw.trim();
    if (t === "") return null;
    return toIsoDate(t) || t;
  }
  return raw;
}

function findGridRefRow(
  lists: Record<GridRefKind, Record<string, unknown>[]>,
  kind: GridRefKind,
  id: number
): Record<string, unknown> | number | null {
  if (id <= 0) return null;
  const spec = GRID_REF_SPECS[kind];
  const found = lists[kind]?.find((r) => pickFk(r, spec.idField) === id);
  return found ?? id;
}

function gridApiBodyToDraftRow(
  sid: GridSectionId,
  body: Record<string, unknown>,
  lists: Record<GridRefKind, Record<string, unknown>[]>
): Record<string, unknown> {
  if (sid === "magazin-trash") {
    const idClass = body.idClassDanger;
    return {
      code_trash: body.codeTrash,
      name_trash: body.nameTrash,
      id_class_danger:
        idClass === FK_CLEAR || idClass == null || Number(idClass) <= 0
          ? null
          : findGridRefRow(lists, "classDanger", Number(idClass)),
      id_type_trash: findGridRefRow(lists, "typeTrash1", Number(body.idTypeTrash ?? 0)),
      id_level_trash: findGridRefRow(lists, "levelTrash", Number(body.idLevelTrash ?? 0)),
      id_mame_group: findGridRefRow(lists, "nameGroup", Number(body.idMameGroup ?? 0)),
      block1: body.block1,
      group2: body.group2,
      group3: body.group3,
    };
  }
  if (sid === "characteristic-trash") {
    const magId = Number(body.idMagazinTrash ?? 0);
    return {
      id_object_place_trash: findGridRefRow(
        lists,
        "objectPlaceTrash",
        Number(body.idObjectPlaceTrash ?? 0)
      ),
      id_magazin_trash:
        findGridRefRow(lists, "magazinTrashCode", magId) ??
        findGridRefRow(lists, "magazinTrashName", magId),
      id_state: findGridRefRow(lists, "physicalState", Number(body.idState ?? 0)),
      weight_for_year: body.weightForYear ?? 0,
      square_for_year: body.squareForYear ?? 0,
    };
  }
  return { ...body };
}

function magazinClassDangerId(mag: unknown): number | null {
  if (!mag || typeof mag !== "object") return null;
  const cd = (mag as Record<string, unknown>).id_class_danger;
  if (cd === null || cd === undefined) return null;
  if (typeof cd === "number") return cd > 0 ? cd : null;
  const id = getNestedId(cd, "id_class_danger");
  return id != null && id > 0 ? id : null;
}

function magazinClassDangerObject(mag: unknown): Record<string, unknown> | null {
  if (!mag || typeof mag !== "object") return null;
  const cd = (mag as Record<string, unknown>).id_class_danger;
  if (cd && typeof cd === "object") return cd as Record<string, unknown>;
  return null;
}

type GridCardState = {
  section: GridSectionId;
  mode: "create" | "edit";
  rowIndex?: number;
  draft: Record<string, unknown>;
};

function PhoneModal(props: {
  row: Record<string, unknown>;
  phoneKind: PhoneKind;
  allPhones: Record<string, unknown>[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onLinkExisting: (phoneId: number, numberValue: string) => Promise<void>;
  showToast: (msg: string) => void;
  draftLocal?: {
    onAdd: (number: string) => void;
    onRemove: (phone: Record<string, unknown>) => void;
    onLinkExisting: (phoneId: number, numberValue: string) => void;
  };
}) {
  const phones = Array.isArray(props.row.phones)
    ? props.row.phones.filter(
        (p) => p && typeof p === "object" && phoneKindMatches(p as Record<string, unknown>, props.phoneKind)
      )
    : [];
  const linkedIds = new Set(
    phones
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>).id_phone_number : null))
      .filter((id): id is number => typeof id === "number")
  );
  const [draft, setDraft] = useState("");
  const oid = props.row.id_object_place_trash;

  const remove = async (rec: Record<string, unknown>) => {
    if (props.draftLocal) {
      props.draftLocal.onRemove(rec);
      props.showToast("Номер убран");
      return;
    }
    const id = rec.id_phone_number;
    try {
      if (typeof oid !== "number" || typeof id !== "number") return;
      await apiDelete(`/api/object-place-trash/${oid}/number-phone/${id}`);
      props.showToast("Номер отвязан от объекта");
      await props.onRefresh();
      await props.onRefreshAll();
    } catch (e) {
      props.showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    if (props.draftLocal) {
      props.draftLocal.onAdd(t);
      setDraft("");
      props.showToast("Добавлено");
      return;
    }
    if (typeof oid !== "number") return;
    try {
      await apiPost("/api/number-phone", {
        idObjectPlaceTrash: oid,
        number: t,
        ur_ob: resolvePhoneStatusForNumber(props.row, t, props.phoneKind),
      });
      setDraft("");
      props.showToast("Добавлено");
      await props.onRefresh();
      await props.onRefreshAll();
    } catch (e) {
      props.showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const linkExisting = (phoneId: number, numberValue: string) => {
    if (props.draftLocal) {
      props.draftLocal.onLinkExisting(phoneId, numberValue);
      props.showToast("Номер добавлен");
      return;
    }
    void props.onLinkExisting(phoneId, numberValue);
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={props.onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span>{props.phoneKind === "legal" ? "Телефон юр. лица" : "Телефон собственника"}</span>
          <button
            type="button"
            className="modal-header-close"
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="cell-input-minimal"
              style={{ flex: 1, minWidth: 160 }}
              type="tel"
              inputMode="tel"
              placeholder="Новый номер"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
            />
            <button type="button" className="btn-small" onClick={() => void add()}>
              Добавить
            </button>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Номера этого объекта</div>
          <table className="modal-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Номер</th>
                <th style={{ width: 88 }} />
              </tr>
            </thead>
            <tbody>
              {phones.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ color: "#71717a" }}>
                    Нет номеров
                  </td>
                </tr>
              ) : (
                phones.map((p) => {
                  const rec = p as Record<string, unknown>;
                  const id = rec.id_phone_number;
                  return (
                    <tr key={str(id)}>
                      <td>{str(rec.number)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-small"
                          onClick={() => void remove(rec)}
                        >
                          Отвязать
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Все занесенные номера</div>
          <table className="modal-table">
            <thead>
              <tr>
                <th>Номер</th>
                <th style={{ width: 120 }}>Статус</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {props.allPhones.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: "#71717a" }}>
                    Нет номеров
                  </td>
                </tr>
              ) : (
                props.allPhones.map((p) => {
                  const rec = p as Record<string, unknown>;
                  const id = rec.id_phone_number;
                  const linked = typeof id === "number" && linkedIds.has(id);
                  return (
                    <tr key={`all-${str(id)}`}>
                      <td>{str(rec.number)}</td>
                      <td style={{ color: linked ? "#15803d" : "#71717a" }}>
                        {linked ? "Связано" : "Не связано"}
                      </td>
                      <td>
                        {!linked && typeof id === "number" ? (
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => linkExisting(id, str(rec.number))}
                          >
                            Добавить
                          </button>
                        ) : (
                          <span style={{ color: "#a1a1aa", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type ObjectRelationKind = "around" | "natural";

function RelationModal(props: {
  title: string;
  linkedRows: Record<string, unknown>[];
  allRows: Record<string, unknown>[];
  itemIdKey: string;
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
  onDelete: (itemId: number) => Promise<void>;
  onLinkExisting: (itemId: number) => Promise<void>;
  draftLocal?: {
    onDeleteItem: (item: Record<string, unknown>) => void;
  };
}) {
  const [draft, setDraft] = useState("");
  const linkedIds = new Set(
    props.linkedRows
      .map((it) => it[props.itemIdKey])
      .filter((id): id is number => typeof id === "number")
  );
  return (
    <div className="modal-overlay" role="presentation" onClick={props.onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span>{props.title}</span>
          <button
            type="button"
            className="modal-header-close"
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {props.draftLocal && props.linkedRows.length > 0 && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Будут добавлены с объектом
              </div>
              <table className="modal-table" style={{ marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th style={{ width: 100 }} />
                  </tr>
                </thead>
                <tbody>
                  {props.linkedRows.map((it) => (
                    <tr key={str(it.__draftKey ?? it[props.itemIdKey])}>
                      <td>{str(it.name)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-small"
                          onClick={() => props.draftLocal!.onDeleteItem(it)}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div
            style={{
              marginBottom: 16,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              className="cell-input-minimal"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="Новое значение"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const t = draft.trim();
                  if (!t) return;
                  setDraft("");
                  void props.onAdd(t);
                }
              }}
            />
            <button
              type="button"
              className="btn-small"
              onClick={() => {
                const t = draft.trim();
                if (!t) return;
                setDraft("");
                void props.onAdd(t);
              }}
            >
              Добавить
            </button>
          </div>
          <table className="modal-table">
            <thead>
              <tr>
                <th>Название</th>
                <th style={{ width: 120 }}>Статус</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {props.allRows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ color: "#71717a" }}>
                    Нет данных
                  </td>
                </tr>
              ) : (
                props.allRows.map((it) => {
                  const id = it[props.itemIdKey];
                  const linked = typeof id === "number" && linkedIds.has(id);
                  return (
                    <tr key={str(id)}>
                      <td>{str(it.name)}</td>
                      <td style={{ color: linked ? "#15803d" : "#71717a" }}>
                        {linked ? "Связано" : "Не связано"}
                      </td>
                      <td>
                        {linked ? (
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => typeof id === "number" && void props.onDelete(id)}
                          >
                            Удалить
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => typeof id === "number" && void props.onLinkExisting(id)}
                          >
                            Добавить
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GridReferenceModal(props: {
  kind: GridRefKind;
  rows: Record<string, unknown>[];
  onClose: () => void;
  onPick: (picked: Record<string, unknown>) => void;
  onCreated: (created: Record<string, unknown>) => void;
  showToast: (msg: string) => void;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  const spec = GRID_REF_SPECS[props.kind];
  const idKey = spec.idField;
  const [draft, setDraft] = useState("");

  const add = async () => {
    try {
      const body = spec.quickCreateFromInput(draft);
      const created = await apiPost<Record<string, unknown>>(spec.apiPath, body);
      props.onCreated(created);
      props.showToast("Добавлено");
      props.onPick(created);
      setDraft("");
    } catch (e) {
      props.showToast(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={props.onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span>{spec.modalTitle}</span>
          <button
            type="button"
            className="modal-header-close"
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {props.allowClear && props.onClear ? (
            <div className="modal-toolbar">
              <span />
              <button type="button" className="modal-toolbar-link" onClick={() => props.onClear?.()}>
                Сбросить связь
              </button>
            </div>
          ) : null}
          <div className="modal-toolbar">
            <input
              className="cell-input-minimal"
              style={{ flex: 1, minWidth: 160 }}
              placeholder={spec.placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
            />
            <button type="button" className="modal-toolbar-link" onClick={() => void add()}>
              Добавить и выбрать
            </button>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="modal-table">
              <thead>
                <tr>
                  <th>{spec.primaryHeader}</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.length === 0 ? (
                  <tr>
                    <td style={{ color: "#71717a" }}>Нет данных</td>
                  </tr>
                ) : (
                  props.rows.map((item) => (
                    <tr key={str(item[idKey])} onClick={() => props.onPick(item)}>
                      <td>{spec.display(item)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferenceModal(props: {
  kind: RefKind;
  rows: Record<string, unknown>[];
  regions: Record<string, unknown>[];
  districts: Record<string, unknown>[];
  selectedRows?: Record<string, unknown>[];
  onClose: () => void;
  onPick: (id: number) => void;
  onClear: () => void;
  onDeleteSelected?: (id: number) => void;
  onCreate: (created: Record<string, unknown>) => void;
  showToast: (msg: string) => void;
}) {
  const cfg = REF_CONFIG[props.kind];
  const [newVal, setNewVal] = useState("");
  const [cityIndex, setCityIndex] = useState("");
  const [cityDistrictId, setCityDistrictId] = useState<number>(() => {
    const d = props.districts[0];
    return d && typeof d.id_district === "number" ? d.id_district : 1;
  });
  const [cityName, setCityName] = useState("");
  const [cityRegionId, setCityRegionId] = useState<number>(() => {
    const r = props.regions[0];
    return r && typeof r.id_region === "number" ? r.id_region : 1;
  });

  const idKey =
    props.kind === "cities"
      ? "id_cities"
      : props.kind === "region"
        ? "id_region"
      : props.kind === "group"
        ? "id_group_place_save"
        : props.kind === "storage"
          ? "id_storage_scheme"
          : props.kind === "degree"
            ? "id_gruops_degree"
            : "id_magazin_trash";

  const add = async () => {
    try {
      if (props.kind === "magazin" || props.kind === "region") return;
      if (props.kind === "group") {
        const created = await apiPost<Record<string, unknown>>(cfg.path, {
          nameRegion: newVal.trim(),
        });
        props.onCreate(created);
        props.showToast(`Добавлено: ${newVal.trim()}`);
        props.onPick(Number(created.id_group_place_save));
        return;
      }
      if (props.kind === "storage") {
        const created = await apiPost<Record<string, unknown>>(cfg.path, {
          nameStorageScheme: newVal.trim(),
        });
        props.onCreate(created);
        props.showToast(`Добавлено: ${newVal.trim()}`);
        props.onPick(Number(created.id_storage_scheme));
        return;
      }
      if (props.kind === "degree") {
        const n = parseInt(newVal.trim(), 10);
        if (Number.isNaN(n)) throw new Error("Введите число");
        const created = await apiPost<Record<string, unknown>>(cfg.path, {
          namberGruop: n,
        });
        props.onCreate(created);
        props.showToast(`Добавлена группа ${n}`);
        props.onPick(Number(created.id_gruops_degree));
        return;
      }
      if (props.kind === "cities") {
        const created = await apiPost<Record<string, unknown>>(cfg.path, {
          idRegion: cityRegionId,
          idDistrict: cityDistrictId,
          nameCities: cityName.trim() || "Новый город",
          name_cities: cityName.trim() || "Новый город",
          index: cityIndex.trim(),
        });
        props.onCreate(created);
        props.showToast("Город добавлен");
        props.onPick(Number(created.id_cities));
        return;
      }
    } catch (e) {
      props.showToast(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={props.onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span>Выбор: {cfg.title}</span>
          <button
            type="button"
            className="modal-header-close"
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-toolbar">
            <span />
            <button type="button" className="modal-toolbar-link" onClick={() => props.onClear()}>
              Сбросить связь
            </button>
          </div>
          {props.kind === "magazin" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Уже выбрано</div>
              {props.selectedRows && props.selectedRows.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {props.selectedRows.map((item) => (
                    <div
                      key={`sel-${str(item[idKey])}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        border: "1px solid #e4e4e7",
                        borderRadius: 8,
                        padding: "6px 8px",
                      }}
                    >
                      <span>{cfg.display(item)}</span>
                      <button
                        type="button"
                        className="btn-small"
                        onClick={() => props.onDeleteSelected?.(Number(item[idKey]))}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#6b7280" }}>Пока не выбрано</div>
              )}
            </div>
          )}
          {props.kind !== "magazin" && props.kind !== "region" && (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {props.kind === "cities" ? (
                <>
                  <input
                    className="cell-input-minimal"
                    placeholder="Город"
                    value={cityName}
                    onChange={(e) => setCityName(e.target.value)}
                  />
                  <input
                    className="cell-input-minimal"
                    placeholder="Индекс"
                    value={cityIndex}
                    onChange={(e) => setCityIndex(e.target.value)}
                  />
                  <select
                    className="filter-select cell-select-minimal"
                    value={cityDistrictId}
                    onChange={(e) => setCityDistrictId(Number(e.target.value))}
                  >
                    {props.districts.map((d) => (
                      <option key={str(d.id_district)} value={str(d.id_district)}>
                        {str(d.name_district)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="filter-select cell-select-minimal"
                    value={cityRegionId}
                    onChange={(e) => setCityRegionId(Number(e.target.value))}
                  >
                    {props.regions.map((r) => (
                      <option key={str(r.id_region)} value={str(r.id_region)}>
                        {str(r.name_region)}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <input
                  className="cell-input-minimal"
                  placeholder="Новое значение..."
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void add()}
                />
              )}
              <button
                type="button"
                className="btn-small"
                style={{ alignSelf: "flex-start" }}
                onClick={() => void add()}
              >
                Добавить и выбрать
              </button>
            </div>
          )}
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="modal-table">
              <thead>
                <tr>
                  <th>{cfg.primaryHeader}</th>
                  {props.kind === "cities" && (
                    <>
                      <th>Область</th>
                      <th>Индекс</th>
                      <th>Район</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {props.rows.length === 0 ? (
                  <tr>
                    <td colSpan={props.kind === "cities" ? 4 : 1}>Нет данных</td>
                  </tr>
                ) : (
                  props.rows.map((item) => (
                    <tr
                      key={str(item[idKey])}
                      onClick={() => props.onPick(Number(item[idKey]))}
                    >
                      <td>{cfg.display(item)}</td>
                      {props.kind === "cities" && (
                        <>
                          <td style={{ color: "#64748b" }}>
                            {str(
                              (item.id_region as Record<string, unknown> | undefined)
                                ?.name_region
                            )}
                          </td>
                          <td style={{ color: "#64748b" }}>{str(item.index)}</td>
                          <td style={{ color: "#64748b" }}>
                            {str(
                              (item.id_district as Record<string, unknown> | undefined)
                                ?.name_district
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ObjectCardModal(props: {
  mode: "edit" | "create";
  row: Record<string, unknown>;
  onClose: () => void;
  getCellValue: (row: Record<string, unknown>, colKey: string) => string;
  onFieldChange: (colKey: string, value: string, type: ObjectCol["type"]) => void;
  onOpenRef: (kind: RefKind, colKey: string) => void;
  onOpenPhones: (kind: PhoneKind) => void;
  onOpenRelation: (kind: ObjectRelationKind) => void;
  onSubmit?: () => void;
  submitting?: boolean;
}) {
  const rowId =
    props.mode === "create"
      ? "new"
      : (props.row.id_object_place_trash as number | string);

  return (
    <div className="modal-overlay object-card-overlay" onClick={props.onClose}>
      <div
        className="modal-content object-card-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span>
            {props.mode === "create"
              ? "Новый паспорт объекта"
              : `Паспорт объекта${
                  props.row.register != null && props.row.register !== ""
                    ? ` — реестр ${str(props.row.register)}`
                    : ""
                }`}
          </span>
          <button type="button" className="modal-header-close" onClick={props.onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal-body object-card-body">
          {OBJECT_COLUMNS.map((col) => {
            const v = props.getCellValue(props.row, col.key);
            if (col.ref) {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value object-card-ref">
                    <span className="object-card-display">{v || "—"}</span>
                    <button
                      type="button"
                      className="modal-footer-btn"
                      onClick={() => props.onOpenRef(col.ref!, col.key)}
                    >
                      Справочник
                    </button>
                  </div>
                </div>
              );
            }
            if (col.key === "__phones") {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value object-card-ref">
                    <span className="object-card-display">{v || "—"}</span>
                    <button
                      type="button"
                      className="modal-footer-btn"
                      onClick={() => props.onOpenPhones("legal")}
                    >
                      Телефоны
                    </button>
                  </div>
                </div>
              );
            }
            if (col.key === "__phones_owner") {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value object-card-ref">
                    <span className="object-card-display">{v || "—"}</span>
                    <button
                      type="button"
                      className="modal-footer-btn"
                      onClick={() => props.onOpenPhones("owner")}
                    >
                      Телефоны
                    </button>
                  </div>
                </div>
              );
            }
            if (col.key === "__around" || col.key === "__natural") {
              const kind: ObjectRelationKind =
                col.key === "__around" ? "around" : "natural";
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value object-card-ref">
                    <span className="object-card-display">{v || "—"}</span>
                    <button
                      type="button"
                      className="modal-footer-btn"
                      onClick={() => props.onOpenRelation(kind)}
                    >
                      Список
                    </button>
                  </div>
                </div>
              );
            }
            if (col.type === "bool") {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value">
                    <select
                      className="filter-select"
                      style={{ width: "100%" }}
                      value={v}
                      onChange={(e) =>
                        props.onFieldChange(col.key, e.target.value, "bool")
                      }
                    >
                      <option value="">—</option>
                      <option value="Да">Да</option>
                      <option value="Нет">Нет</option>
                    </select>
                  </div>
                </div>
              );
            }
            const editable = col.editable !== false;
            if (col.multiline && editable) {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value">
                    <ObjectCellTextarea
                      rowId={rowId}
                      colKey={col.key}
                      value={v}
                      readOnly={false}
                      onCommit={(nv) =>
                        props.onFieldChange(col.key, nv, col.type ?? "text")
                      }
                    />
                  </div>
                </div>
              );
            }
            if (col.type === "date") {
              return (
                <div key={col.key} className="object-card-field">
                  <label className="object-card-label">{col.label}</label>
                  <div className="object-card-value">
                    <DateField
                      key={`${rowId}-${col.key}`}
                      disabled={!editable}
                      value={props.row[col.key] ?? v}
                      inputClassName="cell-input-minimal date-field-text"
                      onChange={(iso) =>
                        editable && props.onFieldChange(col.key, iso, "date")
                      }
                    />
                  </div>
                </div>
              );
            }
            return (
              <div key={col.key} className="object-card-field">
                <label className="object-card-label">{col.label}</label>
                <div className="object-card-value">
                  <input
                    key={`${rowId}-${col.key}-${v}`}
                    className="cell-input-minimal"
                    style={{ width: "100%", ...(editable ? {} : { background: "#f4f4f5" }) }}
                    value={v}
                    type={col.type === "number" ? "number" : "text"}
                    readOnly={!editable}
                    onChange={(e) =>
                      editable &&
                      props.onFieldChange(
                        col.key,
                        e.target.value,
                        col.type ?? "text"
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="object-card-footer">
          <button type="button" className="modal-footer-btn" onClick={props.onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="object-card-submit"
            disabled={props.submitting}
            onClick={() => props.onSubmit?.()}
          >
            {props.submitting
              ? "Сохранение…"
              : props.mode === "create"
                ? "Добавить объект"
                : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RhzoApp() {
  setApiModule("rhzo");

  const [section, setSection] = useState<SectionId>("objects");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  /** Ячейки справочника отходов, подсвеченные как автозаполненные при создании (`id::colKey`). */
  const [magazinAutoCells, setMagazinAutoCells] = useState<Record<string, boolean>>({});
  /** Для колонок кода/наименования отхода (CharacteristicTrash → MagazinTrash) */
  const [characteristicTrashList, setCharacteristicTrashList] = useState<
    Record<string, unknown>[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ui, setUi] = useState<UiState>({
    searchQuery: "",
    sortColumn: "id_registration",
    sortDirection: "asc",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalElements, setTotalElements] = useState(0);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);

  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColWidths);

  useEffect(() => {
    try {
      localStorage.setItem(COL_WIDTHS_LS, JSON.stringify(colWidths));
    } catch {
      /* ignore */
    }
  }, [colWidths]);

  const widthStorageKey = useCallback(
    (colKey: string) => `${section}::${colKey}`,
    [section]
  );

  const getColWidth = useCallback(
    (colKey: string) => {
      return colWidths[widthStorageKey(colKey)] ?? DEFAULT_COL_WIDTH;
    },
    [colWidths, widthStorageKey]
  );

  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;

  const clearMagazinAutoCell = useCallback((rowId: number, colKey: string) => {
    setMagazinAutoCells((prev) => {
      const k = `${rowId}::${colKey}`;
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }, []);

  const stripMagazinAutoRow = useCallback((rowId: number) => {
    const prefix = `${rowId}::`;
    setMagazinAutoCells((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(prefix)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const beginColumnResize = useCallback(
    (colKey: string, clientX: number) => {
      const wk = widthStorageKey(colKey);
      const startW = colWidthsRef.current[wk] ?? DEFAULT_COL_WIDTH;
      const startX = clientX;
      const onMove = (e: MouseEvent) => {
        const nw = Math.max(64, Math.min(800, Math.round(startW + e.clientX - startX)));
        setColWidths((prev) => ({ ...prev, [wk]: nw }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widthStorageKey]
  );

  const [refCache, setRefCache] = useState<Record<RefKind, Record<string, unknown>[]>>({
    cities: [],
    region: [],
    group: [],
    storage: [],
    degree: [],
    magazin: [],
  });
  const [gridRefLists, setGridRefLists] = useState<
    Record<GridRefKind, Record<string, unknown>[]>
  >({
    classDanger: [],
    district: [],
    region: [],
    typeTrash1: [],
    levelTrash: [],
    nameGroup: [],
    objectPlaceTrash: [],
    magazinTrashCode: [],
    magazinTrashName: [],
    physicalState: [],
  });
  const [regionsList, setRegionsList] = useState<Record<string, unknown>[]>([]);
  const [districtsList, setDistrictsList] = useState<Record<string, unknown>[]>([]);

  const [refModal, setRefModal] = useState<{
    kind: RefKind;
    rowIndex: number;
    colKey: string;
  } | null>(null);

  const [gridRefModal, setGridRefModal] = useState<{
    kind: GridRefKind;
    rowIndex?: number;
    colKey: string;
    section: GridSectionId;
    target: "table" | "card";
  } | null>(null);

  const [editingRef, setEditingRef] = useState<{
    kind: RefKind;
    rowIndex: number;
    colKey: string;
    filter: string;
  } | null>(null);

  const [editingGridRef, setEditingGridRef] = useState<{
    kind: GridRefKind;
    rowIndex: number;
    colKey: string;
    filter: string;
  } | null>(null);

  const [editingPhone, setEditingPhone] = useState<{
    rowIndex: number;
    filter: string;
  } | null>(null);

  const [phoneModal, setPhoneModal] = useState<
    | { target: "row"; rowIndex: number; kind: PhoneKind }
    | { target: "create"; kind: PhoneKind }
    | null
  >(null);
  const [editingRelation, setEditingRelation] = useState<{
    kind: ObjectRelationKind;
    rowIndex: number;
    filter: string;
  } | null>(null);
  const [relationModal, setRelationModal] = useState<
    | { target: "row"; rowIndex: number; kind: ObjectRelationKind }
    | { target: "create"; kind: ObjectRelationKind }
    | null
  >(null);
  const [objectCardRowIndex, setObjectCardRowIndex] = useState<number | null>(null);
  const [objectCardEditDraft, setObjectCardEditDraft] = useState<Record<string, unknown> | null>(
    null
  );
  const [objectEditSubmitting, setObjectEditSubmitting] = useState(false);
  const [gridCard, setGridCard] = useState<GridCardState | null>(null);
  const [gridCardSubmitting, setGridCardSubmitting] = useState(false);
  const [objectCreateDraft, setObjectCreateDraft] = useState<Record<string, unknown> | null>(
    null
  );
  const [objectCreateSubmitting, setObjectCreateSubmitting] = useState(false);
  const [allPhones, setAllPhones] = useState<Record<string, unknown>[]>([]);
  const [allAroundBuilds, setAllAroundBuilds] = useState<Record<string, unknown>[]>([]);
  const [allNaturalBuilds, setAllNaturalBuilds] = useState<Record<string, unknown>[]>([]);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const loadRefs = useCallback(async () => {
    try {
      const [
        cities,
        group,
        storage,
        degree,
        regions,
        districts,
        magazin,
        classDanger,
        typeTrash1,
        levelTrash,
        nameGroup,
        objectPlaceTrash,
        physicalState,
      ] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/cities"),
        apiGet<Record<string, unknown>[]>("/api/group-place-save"),
        apiGet<Record<string, unknown>[]>("/api/storage-scheme"),
        apiGet<Record<string, unknown>[]>("/api/gruops-degree"),
        apiGet<Record<string, unknown>[]>("/api/region"),
        apiGet<Record<string, unknown>[]>("/api/district"),
        apiGet<Record<string, unknown>[]>("/api/magazin-trash"),
        apiGet<Record<string, unknown>[]>("/api/classDanger"),
        apiGet<Record<string, unknown>[]>("/api/type-trash1"),
        apiGet<Record<string, unknown>[]>("/api/level-trash"),
        apiGet<Record<string, unknown>[]>("/api/name-group"),
        apiGet<Record<string, unknown>[]>("/api/object-place-trash"),
        apiGet<Record<string, unknown>[]>("/api/physical-state"),
      ]);
      setRefCache({ cities, region: regions, group, storage, degree, magazin });
      setGridRefLists({
        classDanger,
        district: districts,
        region: regions,
        typeTrash1,
        levelTrash,
        nameGroup,
        objectPlaceTrash: Array.isArray(objectPlaceTrash) ? objectPlaceTrash : [],
        magazinTrashCode: Array.isArray(magazin) ? magazin : [],
        magazinTrashName: Array.isArray(magazin) ? magazin : [],
        physicalState: Array.isArray(physicalState) ? physicalState : [],
      });
      setRegionsList(regions);
      setDistrictsList(districts);
    } catch {
      /* ignore */
    }
  }, []);

  const mergeGridRefIntoCache = useCallback(
    (kind: GridRefKind, created: Record<string, unknown>) => {
      setGridRefLists((prev) => ({
        ...prev,
        [kind]: [...prev[kind], created],
      }));
    },
    []
  );

  const refreshCharacteristicTrashList = useCallback(async () => {
    try {
      const list = await apiGet<Record<string, unknown>[]>("/api/characteristic-trash");
      setCharacteristicTrashList(Array.isArray(list) ? list : []);
    } catch {
      /* ignore */
    }
  }, []);

  /** Выбор отхода из MagazinTrash → добавление связи CharacteristicTrash (объект может иметь несколько отходов). */
  const pickMagazinForObject = useCallback(
    async (rowIndex: number, magazinId: number) => {
      const row = rows[rowIndex];
      if (!row || typeof row.id_object_place_trash !== "number") return;
      const oid = row.id_object_place_trash;
      const chars = characteristicTrashList.filter(
        (c) => characteristicObjectPlaceId(c) === oid
      );
      try {
        const hasLink = chars.some((c) => {
          return characteristicMagazinId(c) === magazinId;
        });
        if (hasLink) {
          showToast("Этот отход уже привязан к объекту");
          return;
        }
        const states = await apiGet<Record<string, unknown>[]>("/api/physical-state");
        const first = states?.[0] as Record<string, unknown> | undefined;
        const sid =
          typeof first?.id_state === "number"
            ? first.id_state
            : typeof first?.idState === "number"
              ? first.idState
              : undefined;
        if (sid === undefined) {
          showToast("Нет записей в справочнике PhysicalState");
          return;
        }
        await apiPost("/api/characteristic-trash", {
          idObjectPlaceTrash: oid,
          idMagazinTrash: magazinId,
          idState: sid,
          weightForYear: 0,
          squareForYear: 0,
        });
        await refreshCharacteristicTrashList();
        setEditingRef(null);
        showToast("Сохранено");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [characteristicTrashList, rows, showToast, refreshCharacteristicTrashList]
  );

  const loadGlobalRelationLists = useCallback(async () => {
    try {
      const [around, natural] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/around-build"),
        apiGet<Record<string, unknown>[]>("/api/natual-save-building"),
      ]);
      setAllAroundBuilds(around);
      setAllNaturalBuilds(natural);
    } catch {
      /* ignore */
    }
  }, []);

  const loadAllPhones = useCallback(async () => {
    try {
      const list = await apiGet<Record<string, unknown>[]>("/api/number-phone");
      setAllPhones(list);
    } catch {
      /* ignore */
    }
  }, []);

  const loadSection = useCallback(async (s: SectionId) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(Math.max(0, page - 1)),
        size: String(pageSize),
      });
      if (debouncedQ) params.set("q", debouncedQ);
      if (ui.sortColumn) {
        params.set("sort", ui.sortColumn);
        params.set("dir", ui.sortDirection);
      }
      const apiPath = apiPathForSection(s);
      if (
        showExcluded &&
        (apiPath.includes("object-place-trash") || apiPath.includes("magasin-factory"))
      ) {
        params.set("includeExcluded", "true");
      }
      const path = `${apiPath}?${params}`;
      const data = await apiGet<PagePayload<Record<string, unknown>> | Record<string, unknown>[]>(path);
      if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray((data as PagePayload<Record<string, unknown>>).content)) {
        const pageData = data as PagePayload<Record<string, unknown>>;
        setRows(pageData.content);
        setTotalElements(typeof pageData.totalElements === "number" ? pageData.totalElements : pageData.content.length);
      } else {
        let list = Array.isArray(data) ? data : [];
        if (!showExcluded) list = list.filter((r) => !isExcludedRow(r));
        setRows(list);
        setTotalElements(list.length);
      }
      if (s === "objects") {
        try {
          const chars = await apiGet<Record<string, unknown>[]>("/api/characteristic-trash");
          setCharacteristicTrashList(Array.isArray(chars) ? chars : []);
        } catch {
          setCharacteristicTrashList([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setRows([]);
      setTotalElements(0);
      if (s === "objects") setCharacteristicTrashList([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, ui.sortColumn, ui.sortDirection, showExcluded]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(ui.searchQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [ui.searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, ui.sortColumn, ui.sortDirection, pageSize, section, showExcluded]);

  useEffect(() => {
    if (section === "objects") return;
    void loadSection(section);
  }, [section, loadSection]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    void loadGlobalRelationLists();
  }, [loadGlobalRelationLists]);

  useEffect(() => {
    void loadAllPhones();
  }, [loadAllPhones]);

  useEffect(() => {
    setEditingGridRef(null);
    setGridRefModal(null);
    setObjectCardRowIndex(null);
    setObjectCardEditDraft(null);
    setObjectCreateDraft(null);
    setGridCard(null);
  }, [section]);

  const gridColumns = isGridSection(section) ? getGridDef(section).columns : null;

  const objectRowsWithMerged = useMemo(() => {
    if (section !== "objects") return rows;
    return mergeCharacteristicsIntoObjectRows(rows, characteristicTrashList);
  }, [section, rows, characteristicTrashList]);

  const objectCardEditDisplay = useMemo(() => {
    if (!objectCardEditDraft) return null;
    return mergeCharacteristicsIntoObjectRows([objectCardEditDraft], characteristicTrashList)[0];
  }, [objectCardEditDraft, characteristicTrashList]);

  const objectCreateDisplay = useMemo(
    () => (objectCreateDraft ? enrichCreateDraftForDisplay(objectCreateDraft) : null),
    [objectCreateDraft]
  );

  const displayRows = useMemo(() => {
    // Поиск/сортировка на бэке (page+size+q+sort+dir)
    if (section === "objects") return objectRowsWithMerged;
    return rows;
  }, [objectRowsWithMerged, rows, section]);

  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize) || 1);
  const safePage = Math.min(page, totalPages);

  const clearFilters = () => {
    setUi({
      searchQuery: "",
      sortColumn: section === "objects" ? "id_registration" : null,
      sortDirection: "asc",
    });
    setShowExcluded(false);
    setPage(1);
  };

  const switchSection = (s: SectionId) => {
    setSection(s);
    setGridCard(null);
    setPage(1);
    setShowExcluded(false);
    setUi({
      searchQuery: "",
      sortColumn: s === "objects" ? "id_registration" : null,
      sortDirection: "asc",
    });
  };

  const triggerAddRow = () => {
    if (section === "objects") {
      setObjectCardRowIndex(null);
      setObjectCardEditDraft(null);
      setObjectCreateDraft(buildNewObjectDraft(rows));
      return;
    }
    if (isGridSection(section) && hasGridCard(section)) {
      void openGridCreateCard(section);
      return;
    }
    if (isGridSection(section)) {
      void addGridRow(section);
    }
  };

  const saveObjectPatch = async (index: number, patch: Record<string, unknown>) => {
    const row = rows[index];
    if (!row || typeof row.id_object_place_trash !== "number") return;
    const id = row.id_object_place_trash;
    try {
      const body = objectPlaceTrashToRequest(row, patch);
      const updated = await apiPut<Record<string, unknown>>(
        `/api/object-place-trash/${id}`,
        body
      );
      setRows((prev) => {
        const next = [...prev];
        next[index] = updated;
        return next;
      });
      showToast("Сохранено");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const refreshObjectRow = useCallback(async (objectId: number) => {
    const updated = await apiGet<Record<string, unknown>>(
      `/api/object-place-trash/${objectId}`
    );
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id_object_place_trash === objectId);
      if (i < 0) return prev;
      const next = [...prev];
      next[i] = updated;
      return next;
    });
  }, []);

  const addPhoneForObject = useCallback(
    async (index: number, rawNumber: string): Promise<boolean> => {
      const row = rows[index];
      if (!row || typeof row.id_object_place_trash !== "number") return false;
      const id = row.id_object_place_trash;
      const trimmed = rawNumber.trim();
      if (!trimmed) {
        showToast("Введите номер");
        return false;
      }
      try {
        await apiPost("/api/number-phone", {
          idObjectPlaceTrash: id,
          number: trimmed,
          ur_ob: resolvePhoneStatusForNumber(row, trimmed, "owner"),
        });
        await refreshObjectRow(id);
        await loadAllPhones();
        showToast("Телефон добавлен");
        return true;
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
        return false;
      }
    },
    [loadAllPhones, rows, refreshObjectRow, showToast]
  );

  const linkExistingPhoneToObject = useCallback(
    async (rowIndex: number, phoneId: number, numberValue: string, kind: PhoneKind) => {
      const row = rows[rowIndex];
      if (!row || typeof row.id_object_place_trash !== "number") return;
      const objectId = row.id_object_place_trash;
      try {
        await apiPut(`/api/number-phone/${phoneId}`, {
          idObjectPlaceTrash: objectId,
          number: numberValue,
          ur_ob: resolvePhoneStatusForNumber(row, numberValue, kind),
        });
        await refreshObjectRow(objectId);
        await loadAllPhones();
        showToast("Номер привязан");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [loadAllPhones, refreshObjectRow, rows, showToast]
  );

  const relationPath = (kind: ObjectRelationKind, objectId: number) =>
    kind === "around"
      ? `/api/object-place-trash/${objectId}/around-builds`
      : `/api/object-place-trash/${objectId}/natual-save-buildings`;

  const relationKeyInRow = (kind: ObjectRelationKind) =>
    kind === "around" ? "aroundBuilds" : "naturalSaveBuildings";

  const loadObjectRelationByObjectId = useCallback(
    async (objectId: number, kind: ObjectRelationKind) => {
      try {
        const list = await apiGet<Record<string, unknown>[]>(relationPath(kind, objectId));
        const rowKey = relationKeyInRow(kind);
        setRows((prev) => {
          const i = prev.findIndex((r) => r.id_object_place_trash === objectId);
          if (i < 0) return prev;
          const next = [...prev];
          next[i] = { ...next[i], [rowKey]: list };
          return next;
        });
      } catch {
        /* ignore */
      }
    },
    []
  );

  const loadObjectRelation = useCallback(
    async (rowIndex: number, kind: ObjectRelationKind) => {
      const row = rows[rowIndex];
      if (!row || typeof row.id_object_place_trash !== "number") return;
      await loadObjectRelationByObjectId(row.id_object_place_trash, kind);
    },
    [loadObjectRelationByObjectId, rows]
  );

  useEffect(() => {
    if (section !== "objects" || rows.length === 0) return;
    const needLoad = rows
      .filter(
        (r) =>
          typeof r.id_object_place_trash === "number" &&
          (r.aroundBuilds === undefined || r.naturalSaveBuildings === undefined)
      )
      .slice(0, 30);
    if (needLoad.length === 0) return;
    void Promise.all(
      needLoad.flatMap((r) => [
        loadObjectRelationByObjectId(r.id_object_place_trash as number, "around"),
        loadObjectRelationByObjectId(r.id_object_place_trash as number, "natural"),
      ])
    );
  }, [loadObjectRelationByObjectId, rows, section]);

  const addObjectRelation = useCallback(
    async (rowIndex: number, kind: ObjectRelationKind, name: string) => {
      const row = rows[rowIndex];
      if (!row || typeof row.id_object_place_trash !== "number") return;
      const objectId = row.id_object_place_trash;
      try {
        await apiPost(relationPath(kind, objectId), { name });
        await loadObjectRelationByObjectId(objectId, kind);
        await loadGlobalRelationLists();
        showToast("Добавлено");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [loadGlobalRelationLists, loadObjectRelationByObjectId, rows, showToast]
  );

  const deleteObjectRelation = useCallback(
    async (rowIndex: number, kind: ObjectRelationKind, itemId: number) => {
      const row = rows[rowIndex];
      if (!row || typeof row.id_object_place_trash !== "number") return;
      const objectId = row.id_object_place_trash;
      try {
        await apiDelete(`${relationPath(kind, objectId)}/${itemId}`);
        await loadObjectRelationByObjectId(objectId, kind);
        showToast("Удалено");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [loadObjectRelationByObjectId, rows, showToast]
  );

  const linkExistingObjectRelation = useCallback(
    async (rowIndex: number, kind: ObjectRelationKind, itemId: number) => {
      const row = rows[rowIndex];
      if (!row || typeof row.id_object_place_trash !== "number") return;
      const objectId = row.id_object_place_trash;
      try {
        if (kind === "around") {
          await apiPost(relationPath(kind, objectId), { aroundBuildId: itemId });
        } else {
          await apiPost(relationPath(kind, objectId), { natualSaveBuildId: itemId });
        }
        await loadObjectRelationByObjectId(objectId, kind);
        showToast("Связь добавлена");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [loadObjectRelationByObjectId, rows, showToast]
  );

  const onObjectFieldBlur = (
    index: number,
    key: string,
    raw: string,
    type?: ObjectCol["type"]
  ) => {
    const row = rows[index];
    if (!row) return;
    const patch = buildObjectFieldPatch(row, key, raw, type);
    if (!patch) return;
    void saveObjectPatch(index, patch);
  };

  const onObjectCreateFieldChange = (
    key: string,
    raw: string,
    type?: ObjectCol["type"]
  ) => {
    setObjectCreateDraft((prev) => {
      if (!prev) return prev;
      const patch = buildObjectFieldPatch(prev, key, raw, type);
      if (!patch) return prev;
      return { ...prev, ...patch };
    });
  };

  const onObjectEditFieldChange = (
    key: string,
    raw: string,
    type?: ObjectCol["type"]
  ) => {
    setObjectCardEditDraft((prev) => {
      if (!prev) return prev;
      const patch = buildObjectFieldPatch(prev, key, raw, type);
      if (!patch) return prev;
      return { ...prev, ...patch };
    });
  };

  const submitObjectEdit = async () => {
    if (objectCardRowIndex === null || !objectCardEditDraft || objectEditSubmitting) return;
    const id = objectCardEditDraft.id_object_place_trash;
    if (typeof id !== "number") return;
    setObjectEditSubmitting(true);
    try {
      const body = objectPlaceTrashToRequest(objectCardEditDraft);
      const updated = await apiPut<Record<string, unknown>>(
        `/api/object-place-trash/${id}`,
        body
      );
      setRows((prev) => {
        const next = [...prev];
        next[objectCardRowIndex] = updated;
        return next;
      });
      showToast("Сохранено");
      setObjectCardRowIndex(null);
      setObjectCardEditDraft(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setObjectEditSubmitting(false);
    }
  };

  const applyRefToObjectDraft = useCallback(
    (kind: RefKind, id: number) => {
      const idKey = refKindIdField(kind);
      setObjectCreateDraft((prev) => {
        if (!prev) return prev;
        if (kind === "magazin") {
          const item = refCache.magazin.find((r) => Number(r[idKey]) === id);
          if (!item) return prev;
          const list = Array.isArray(prev.__draftMagazin)
            ? [...(prev.__draftMagazin as Record<string, unknown>[])]
            : [];
          if (list.some((m) => Number(m[idKey]) === id)) return prev;
          return { ...prev, __draftMagazin: [...list, item] };
        }
        if (kind === "cities") {
          const city = refCache.cities.find((c) => Number(c[idKey]) === id);
          if (!city) return prev;
          const reg = city.id_region;
          return { ...prev, id_cities: city, ...(reg ? { id_region: reg } : {}) };
        }
        const item = refCache[kind].find((r) => Number(r[idKey]) === id);
        if (!item) return prev;
        const field = refKindToObjectField(kind);
        return field ? { ...prev, [field]: item } : prev;
      });
    },
    [refCache]
  );

  const clearRefFromObjectDraft = useCallback((kind: RefKind) => {
    setObjectCreateDraft((prev) => {
      if (!prev) return prev;
      if (kind === "magazin") return { ...prev, __draftMagazin: [] };
      if (kind === "cities") return { ...prev, id_cities: null, id_region: null };
      const field = refKindToObjectField(kind);
      return field ? { ...prev, [field]: null } : prev;
    });
  }, []);

  const applyRefToObjectEditDraft = useCallback(
    (kind: RefKind, id: number) => {
      const idKey = refKindIdField(kind);
      setObjectCardEditDraft((prev) => {
        if (!prev) return prev;
        if (kind === "cities") {
          const city = refCache.cities.find((c) => Number(c[idKey]) === id);
          if (!city) return prev;
          const reg = city.id_region;
          return { ...prev, id_cities: city, ...(reg ? { id_region: reg } : {}) };
        }
        const item = refCache[kind].find((r) => Number(r[idKey]) === id);
        if (!item) return prev;
        const field = refKindToObjectField(kind);
        return field ? { ...prev, [field]: item } : prev;
      });
    },
    [refCache]
  );

  const clearRefFromObjectEditDraft = useCallback((kind: RefKind) => {
    setObjectCardEditDraft((prev) => {
      if (!prev) return prev;
      if (kind === "magazin") return prev;
      if (kind === "cities") return { ...prev, id_cities: null, id_region: null };
      const field = refKindToObjectField(kind);
      return field ? { ...prev, [field]: null } : prev;
    });
  }, []);

  const unlinkMagazinFromCreateDraft = useCallback((magazinId: number) => {
    setObjectCreateDraft((prev) => {
      if (!prev) return prev;
      const list = Array.isArray(prev.__draftMagazin)
        ? (prev.__draftMagazin as Record<string, unknown>[]).filter(
            (m) => getNestedId(m, "id_magazin_trash") !== magazinId
          )
        : [];
      return { ...prev, __draftMagazin: list };
    });
    showToast("Отход убран");
  }, [showToast]);

  const addDraftPhone = useCallback((number: string, kind: PhoneKind) => {
    setObjectCreateDraft((prev) => {
      if (!prev) return prev;
      const phones = Array.isArray(prev.phones)
        ? [...(prev.phones as Record<string, unknown>[])]
        : [];
      const enriched = enrichCreateDraftForDisplay({ ...prev, phones });
      phones.push({
        number: number.trim(),
        ur_ob: resolvePhoneStatusForNumber(enriched, number, kind),
        __draftKey: Date.now(),
      });
      return { ...prev, phones };
    });
  }, []);

  const removeDraftPhone = useCallback((phone: Record<string, unknown>) => {
    setObjectCreateDraft((prev) => {
      if (!prev) return prev;
      const phones = Array.isArray(prev.phones)
        ? (prev.phones as Record<string, unknown>[]).filter((p) => {
            if (phone.__draftKey != null && p.__draftKey === phone.__draftKey) return false;
            if (
              phone.id_phone_number != null &&
              p.id_phone_number === phone.id_phone_number
            )
              return false;
            return true;
          })
        : [];
      return { ...prev, phones };
    });
  }, []);

  const linkDraftPhone = useCallback(
    (phoneId: number, numberValue: string, kind: PhoneKind) => {
      setObjectCreateDraft((prev) => {
        if (!prev) return prev;
        const phones = Array.isArray(prev.phones)
          ? (prev.phones as Record<string, unknown>[]).filter(
              (p) => p.id_phone_number !== phoneId
            )
          : [];
        const enriched = enrichCreateDraftForDisplay({ ...prev, phones });
        phones.push({
          id_phone_number: phoneId,
          number: numberValue,
          ur_ob: resolvePhoneStatusForNumber(enriched, numberValue, kind),
        });
        return { ...prev, phones };
      });
    },
    []
  );

  const addDraftRelation = useCallback((kind: ObjectRelationKind, name: string) => {
    setObjectCreateDraft((prev) => {
      if (!prev) return prev;
      const key = draftRelationKey(kind);
      const list = Array.isArray(prev[key])
        ? [...(prev[key] as Record<string, unknown>[])]
        : [];
      list.push({ name: name.trim(), __pendingNew: true, __draftKey: Date.now() });
      return { ...prev, [key]: list };
    });
    showToast("Добавлено");
  }, [showToast]);

  const deleteDraftRelationItem = useCallback(
    (kind: ObjectRelationKind, item: Record<string, unknown>) => {
      setObjectCreateDraft((prev) => {
        if (!prev) return prev;
        const key = draftRelationKey(kind);
        const idKey = kind === "around" ? "id_around_build" : "id_natual_save_build";
        const list = Array.isArray(prev[key])
          ? (prev[key] as Record<string, unknown>[]).filter((it) => {
              if (item.__draftKey != null && it.__draftKey === item.__draftKey) return false;
              if (item[idKey] != null && it[idKey] === item[idKey]) return false;
              return true;
            })
          : [];
        return { ...prev, [key]: list };
      });
      showToast("Удалено");
    },
    [showToast]
  );

  const linkDraftRelation = useCallback(
    (kind: ObjectRelationKind, itemId: number) => {
      setObjectCreateDraft((prev) => {
        if (!prev) return prev;
        const key = draftRelationKey(kind);
        const idKey = kind === "around" ? "id_around_build" : "id_natual_save_build";
        const all = kind === "around" ? allAroundBuilds : allNaturalBuilds;
        const item = all.find((it) => Number(it[idKey]) === itemId);
        if (!item) return prev;
        const list = Array.isArray(prev[key])
          ? [...(prev[key] as Record<string, unknown>[])]
          : [];
        if (list.some((it) => Number(it[idKey]) === itemId)) return prev;
        list.push(item);
        return { ...prev, [key]: list };
      });
      showToast("Связь добавлена");
    },
    [allAroundBuilds, allNaturalBuilds, showToast]
  );

  const submitObjectCreate = async () => {
    if (!objectCreateDraft || objectCreateSubmitting) return;
    setObjectCreateSubmitting(true);
    try {
      const body = objectPlaceTrashToRequest(objectCreateDraft);
      const created = await apiPost<Record<string, unknown>>("/api/object-place-trash", body);
      const objectId = created.id_object_place_trash;
      if (typeof objectId !== "number") {
        throw new Error("Сервер не вернул id объекта");
      }

      const phones = Array.isArray(objectCreateDraft.phones)
        ? (objectCreateDraft.phones as Record<string, unknown>[])
        : [];
      for (const p of phones) {
        const num = str(p.number).trim();
        if (!num) continue;
        const phoneId = p.id_phone_number;
        const urOb = p.ur_ob;
        if (typeof phoneId === "number" && phoneId > 0) {
          await apiPut(`/api/number-phone/${phoneId}`, {
            idObjectPlaceTrash: objectId,
            number: num,
            ur_ob: urOb,
          });
        } else {
          await apiPost("/api/number-phone", {
            idObjectPlaceTrash: objectId,
            number: num,
            ur_ob: urOb,
          });
        }
      }

      const magazinList = Array.isArray(objectCreateDraft.__draftMagazin)
        ? (objectCreateDraft.__draftMagazin as Record<string, unknown>[])
        : [];
      if (magazinList.length > 0) {
        const states = await apiGet<Record<string, unknown>[]>("/api/physical-state");
        const first = states?.[0] as Record<string, unknown> | undefined;
        const sid =
          typeof first?.id_state === "number"
            ? first.id_state
            : typeof first?.idState === "number"
              ? first.idState
              : undefined;
        if (sid === undefined) {
          throw new Error("Нет записей в справочнике PhysicalState");
        }
        for (const m of magazinList) {
          const mid = getNestedId(m, "id_magazin_trash");
          if (typeof mid !== "number") continue;
          await apiPost("/api/characteristic-trash", {
            idObjectPlaceTrash: objectId,
            idMagazinTrash: mid,
            idState: sid,
            weightForYear: 0,
            squareForYear: 0,
          });
        }
      }

      for (const kind of ["around", "natural"] as const) {
        const key = draftRelationKey(kind);
        const list = Array.isArray(objectCreateDraft[key])
          ? (objectCreateDraft[key] as Record<string, unknown>[])
          : [];
        for (const item of list) {
          if (item.__pendingNew) {
            const name = str(item.name).trim();
            if (name) await apiPost(relationPath(kind, objectId), { name });
          } else {
            const idKey = kind === "around" ? "id_around_build" : "id_natual_save_build";
            const itemId = item[idKey];
            if (typeof itemId !== "number") continue;
            if (kind === "around") {
              await apiPost(relationPath(kind, objectId), { aroundBuildId: itemId });
            } else {
              await apiPost(relationPath(kind, objectId), { natualSaveBuildId: itemId });
            }
          }
        }
      }

      showToast("Объект создан");
      setObjectCreateDraft(null);
      await loadSection("objects");
      void loadRefs();
      void loadGlobalRelationLists();
      void loadAllPhones();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setObjectCreateSubmitting(false);
    }
  };

  const mergeRefIntoCache = (kind: RefKind, created: Record<string, unknown>) => {
    setRefCache((prev) => ({
      ...prev,
      [kind]: [...prev[kind], created],
    }));
  };

  const openRefModal = (kind: RefKind, rowIndex: number, colKey: string) => {
    setRefModal({ kind, rowIndex, colKey });
    void loadRefs();
  };

  const pickRef = async (kind: RefKind, rowIndex: number, id: number) => {
    setRefModal(null);
    if (rowIndex === OBJECT_CREATE_ROW_INDEX) {
      applyRefToObjectDraft(kind, id);
      return;
    }
    if (objectCardRowIndex !== null && rowIndex === objectCardRowIndex) {
      if (kind === "magazin") {
        showToast("Связь с отходом — в разделе «Характеристики отходов»");
        return;
      }
      applyRefToObjectEditDraft(kind, id);
      return;
    }
    if (kind === "magazin") {
      await pickMagazinForObject(rowIndex, id);
      return;
    }
    if (kind === "cities") {
      const city = refCache.cities.find((c) => Number(c.id_cities) === id);
      const reg = city?.id_region;
      const regionId =
        typeof reg === "number"
          ? reg
          : reg && typeof reg === "object"
            ? getNestedId(reg, "id_region") ??
              ((reg as Record<string, unknown>).idRegion as number | undefined)
            : undefined;
      await saveObjectPatch(rowIndex, {
        citiesId: id,
        ...(typeof regionId === "number" ? { regionId } : {}),
      });
      return;
    }
    const patchKey = REF_CONFIG[kind].patchKey;
    await saveObjectPatch(rowIndex, { [patchKey]: id });
  };

  const clearRef = async (kind: RefKind, rowIndex: number) => {
    setRefModal(null);
    if (rowIndex === OBJECT_CREATE_ROW_INDEX) {
      clearRefFromObjectDraft(kind);
      setEditingRef(null);
      return;
    }
    if (objectCardRowIndex !== null && rowIndex === objectCardRowIndex) {
      if (kind === "magazin") {
        showToast("Связь с отходом снимите в разделе «Характеристики отходов»");
        setEditingRef(null);
        return;
      }
      clearRefFromObjectEditDraft(kind);
      setEditingRef(null);
      return;
    }
    if (kind === "magazin") {
      showToast("Связь с отходом снимите в таблице CharacteristicTrash");
      setEditingRef(null);
      return;
    }
    if (kind === "cities") {
      await saveObjectPatch(
        rowIndex,
        { citiesId: FK_CLEAR, regionId: FK_CLEAR } as Record<string, unknown>
      );
      setEditingRef(null);
      return;
    }
    const patchKey = REF_CONFIG[kind].patchKey;
    await saveObjectPatch(rowIndex, { [patchKey]: FK_CLEAR } as Record<string, unknown>);
    setEditingRef(null);
  };

  const unlinkMagazinFromObject = async (rowIndex: number, magazinId: number) => {
    const row = rows[rowIndex];
    if (!row || typeof row.id_object_place_trash !== "number") return;
    const oid = row.id_object_place_trash;
    try {
      const links = characteristicTrashList.filter(
        (c) =>
          characteristicObjectPlaceId(c) === oid && characteristicMagazinId(c) === magazinId
      );
      if (links.length === 0) {
        showToast("Связь не найдена");
        return;
      }
      await Promise.all(
        links.map(async (c) => {
          const cid = characteristicTrashRowId(c);
          if (typeof cid === "number") {
            await apiDelete(`/api/characteristic-trash/${cid}`);
          }
        })
      );
      await refreshCharacteristicTrashList();
      showToast("Удалено");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  const deleteRow = async (s: SectionId, row: Record<string, unknown>) => {
    const idf = idFieldForSection(s);
    const id = row[idf];
    if (typeof id !== "number") return;
    if (!window.confirm("Удалить запись?")) return;
    try {
      await apiDelete(`${apiPathForSection(s)}/${id}`);
      showToast("Удалено");
      if (s === "magazin-trash") stripMagazinAutoRow(id);
      await loadSection(s);
      void loadRefs();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  const addGridRow = async (sid: GridSectionId) => {
    const def = getGridDef(sid);
    try {
      const body = await def.createDefault();
      const created = await apiPost<Record<string, unknown>>(def.apiPath, body);
      showToast("Строка добавлена");
      if (sid === "magazin-trash") {
        const nid =
          typeof created.id_magazin_trash === "number"
            ? created.id_magazin_trash
            : typeof created.idMagazinTrash === "number"
              ? created.idMagazinTrash
              : null;
        if (nid != null && nid > 0) {
          setMagazinAutoCells((prev) => {
            const next = { ...prev };
            for (const c of def.columns) {
              next[`${nid}::${c.key}`] = true;
            }
            return next;
          });
        }
      }
      await loadSection(sid);
      void loadRefs();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const saveGridRow = async (row: Record<string, unknown>, idx: number, sid: GridSectionId) => {
    const def = getGridDef(sid);
    const idf = def.idField;
    const id = row[idf];
    if (typeof id !== "number" || id < 0) return;
    try {
      const body = def.toRequest(row);
      const updated = await apiPut<Record<string, unknown>>(`${def.apiPath}/${id}`, body);
      setRows((prev) => {
        const next = [...prev];
        const origIdx = prev.findIndex((r) => r[idf] === id);
        if (origIdx >= 0) next[origIdx] = updated;
        else next[idx] = updated;
        return next;
      });
      showToast("Сохранено");
      if (sid === "magazin-trash") void loadRefs();
      if (sid === "characteristic-trash") void refreshCharacteristicTrashList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const openGridCreateCard = async (sid: GridSectionId) => {
    try {
      const def = getGridDef(sid);
      const body = await def.createDefault();
      const draft = gridApiBodyToDraftRow(sid, body, gridRefLists);
      setGridCard({ section: sid, mode: "create", draft });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const onGridCardDraftChange = (colKey: string, value: string, type?: SimpleCol["type"]) => {
    if (!gridCard) return;
    const col = getGridDef(gridCard.section).columns.find((c) => c.key === colKey);
    if (!col || col.readOnly || col.format || col.gridRef) return;
    setGridCard((prev) => {
      if (!prev) return prev;
      const nextVal = parseGridInput(value, col, prev.draft);
      return { ...prev, draft: { ...prev.draft, [colKey]: nextVal } };
    });
  };

  const applyGridFkToCardDraft = (
    colKey: string,
    picked: Record<string, unknown> | null
  ) => {
    setGridCard((prev) => {
      if (!prev) return prev;
      const sid = prev.section;
      if (sid === "characteristic-trash" && colKey === "__class_danger") {
        const mag = prev.draft.id_magazin_trash;
        let magObj: Record<string, unknown>;
        if (mag && typeof mag === "object") {
          magObj = { ...(mag as Record<string, unknown>) };
        } else {
          const magId = pickFk(mag, "id_magazin_trash");
          const found =
            gridRefLists.magazinTrashCode.find(
              (m) => pickFk(m, "id_magazin_trash") === magId
            ) ??
            gridRefLists.magazinTrashName.find(
              (m) => pickFk(m, "id_magazin_trash") === magId
            );
          magObj = found ? { ...found } : { id_magazin_trash: magId };
        }
        magObj.id_class_danger = picked;
        return { ...prev, draft: { ...prev.draft, id_magazin_trash: magObj } };
      }
      const targetKey =
        sid === "characteristic-trash" ? characteristicFkTarget(colKey) : colKey;
      return { ...prev, draft: { ...prev.draft, [targetKey]: picked } };
    });
    setEditingGridRef(null);
    setGridRefModal(null);
  };

  const submitGridCard = async () => {
    if (!gridCard || gridCardSubmitting) return;
    const { section: sid, mode, draft, rowIndex } = gridCard;
    const def = getGridDef(sid);
    setGridCardSubmitting(true);
    try {
      if (mode === "create") {
        const created = await apiPost<Record<string, unknown>>(def.apiPath, def.toRequest(draft));
        if (sid === "characteristic-trash") {
          const classObj = magazinClassDangerObject(draft.id_magazin_trash);
          if (classObj) {
            await updateCharacteristicClassDanger(
              { ...draft, id_characteristic_trash: created.id_characteristic_trash },
              classObj
            );
          }
        }
        showToast("Добавлено");
      } else {
        const id = draft[def.idField];
        if (typeof id !== "number" || id < 0) throw new Error("Некорректный id записи");
        if (sid === "characteristic-trash" && rowIndex !== undefined) {
          const orig = rows[rowIndex];
          const origClass = magazinClassDangerId(orig?.id_magazin_trash);
          const newClass = magazinClassDangerId(draft.id_magazin_trash);
          await apiPut<Record<string, unknown>>(
            `${def.apiPath}/${id}`,
            def.toRequest(draft)
          );
          if (origClass !== newClass) {
            await updateCharacteristicClassDanger(
              draft,
              magazinClassDangerObject(draft.id_magazin_trash)
            );
          }
        } else {
          await apiPut<Record<string, unknown>>(`${def.apiPath}/${id}`, def.toRequest(draft));
        }
        showToast("Сохранено");
      }
      setGridCard(null);
      await loadSection(sid);
      void loadRefs();
      if (sid === "characteristic-trash") void refreshCharacteristicTrashList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGridCardSubmitting(false);
    }
  };

  const openGridRefFromCard = (colKey: string) => {
    if (!gridCard) return;
    const col = getGridDef(gridCard.section).columns.find((c) => c.key === colKey);
    if (!col?.gridRef) return;
    setGridRefModal({
      kind: col.gridRef,
      colKey,
      section: gridCard.section,
      target: "card",
    });
  };

  const characteristicFkTarget = (colKey: string): string => {
    if (colKey === "__register") return "id_object_place_trash";
    if (colKey === "__code_trash" || colKey === "__name_trash")
      return "id_magazin_trash";
    if (colKey === "__state") return "id_state";
    return colKey;
  };

  const updateCharacteristicClassDanger = async (
    row: Record<string, unknown>,
    nextClassDanger: Record<string, unknown> | null
  ) => {
    const rawMag = row.id_magazin_trash;
    const magId =
      typeof rawMag === "number" ? rawMag : getNestedId(rawMag, "id_magazin_trash");
    if (magId == null || magId <= 0) {
      showToast("Не найден связанный отход");
      return;
    }
    const existingMag =
      (rawMag && typeof rawMag === "object" ? (rawMag as Record<string, unknown>) : null) ??
      gridRefLists.magazinTrashCode.find(
        (m) => getNestedId(m, "id_magazin_trash") === magId
      ) ??
      gridRefLists.magazinTrashName.find(
        (m) => getNestedId(m, "id_magazin_trash") === magId
      );
    if (!existingMag) {
      showToast("Не удалось загрузить запись отхода");
      return;
    }
    try {
      const magDef = getGridDef("magazin-trash");
      const body = magDef.toRequest({
        ...existingMag,
        id_magazin_trash: magId,
        id_class_danger: nextClassDanger,
      });
      await apiPut<Record<string, unknown>>(`${magDef.apiPath}/${magId}`, body);
      showToast("Сохранено");
      await loadSection("characteristic-trash");
      void loadRefs();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const applyGridFkAndSave = async (
    rowIndex: number,
    colKey: string,
    picked: Record<string, unknown>,
    sid: GridSectionId
  ) => {
    const row = rows[rowIndex];
    if (!row) return;
    if (sid === "characteristic-trash" && colKey === "__class_danger") {
      setEditingGridRef(null);
      setGridRefModal(null);
      await updateCharacteristicClassDanger(row, picked);
      return;
    }
    const idf = getGridDef(sid).idField;
    const oid = row[idf];
    if (sid === "magazin-trash" && typeof oid === "number" && oid > 0) {
      clearMagazinAutoCell(oid, colKey);
    }
    const targetKey =
      sid === "characteristic-trash" ? characteristicFkTarget(colKey) : colKey;
    const next = { ...row, [targetKey]: picked };
    setEditingGridRef(null);
    setGridRefModal(null);
    await saveGridRow(next, rowIndex, sid);
  };

  const applyGridFkClear = async (
    rowIndex: number,
    colKey: string,
    sid: GridSectionId
  ) => {
    const row = rows[rowIndex];
    if (!row) return;
    if (sid === "characteristic-trash" && colKey === "__class_danger") {
      setEditingGridRef(null);
      setGridRefModal(null);
      await updateCharacteristicClassDanger(row, null);
      return;
    }
    const idf = getGridDef(sid).idField;
    const oid = row[idf];
    if (sid === "magazin-trash" && typeof oid === "number" && oid > 0) {
      clearMagazinAutoCell(oid, colKey);
    }
    const targetKey =
      sid === "characteristic-trash" ? characteristicFkTarget(colKey) : colKey;
    const next = { ...row, [targetKey]: null };
    setEditingGridRef(null);
    setGridRefModal(null);
    await saveGridRow(next, rowIndex, sid);
  };

  const sortHeaderClick = (colKey: string) => {
    setUi((prev) => {
      if (prev.sortColumn === colKey) {
        return {
          ...prev,
          sortDirection: prev.sortDirection === "asc" ? "desc" : "asc",
        };
      }
      return { ...prev, sortColumn: colKey, sortDirection: "asc" };
    });
  };

  const resolveObjectRowIndex = (filteredRow: Record<string, unknown>): number => {
    const id = filteredRow.id_object_place_trash;
    return rows.findIndex((r) => r.id_object_place_trash === id);
  };

  const resolveGridRowIndex = (filteredRow: Record<string, unknown>, sid: GridSectionId): number => {
    const idf = getGridDef(sid).idField;
    const id = filteredRow[idf];
    return rows.findIndex((r) => r[idf] === id);
  };

  const pageTitle =
    section === "objects" ? OBJECT_SECTION.title : getGridDef(section).title;

  const colCount =
    section === "objects" ? OBJECT_TABLE_COLUMNS.length : (gridColumns?.length ?? 0);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">РХЗО — таблицы</div>
        <nav className="table-list">
          <button
            type="button"
            className={`table-item ${section === "objects" ? "active" : ""}`}
            onClick={() => switchSection("objects")}
          >
            {OBJECT_SECTION.sidebar}
          </button>
          {GRID_SECTION_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`table-item ${section === id ? "active" : ""}`}
              onClick={() => switchSection(id)}
            >
              {getGridDef(id).sidebar}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {section === "objects" ? (
          <RhzoObjectHub />
        ) : (
          <>
        <div className="page-header-row">
          <h1 className="page-title">{pageTitle}</h1>
          <button type="button" className="page-add-btn" onClick={triggerAddRow}>
            + Создать
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <input
              type="search"
              placeholder="Поиск по всей таблице (сервер)…"
              value={ui.searchQuery}
              onChange={(e) => setUi((p) => ({ ...p, searchQuery: e.target.value }))}
            />
            <ExcludeFilterControl showExcluded={showExcluded} onChange={setShowExcluded} />
          </div>
          <button type="button" className="clear-filters" onClick={clearFilters}>
            Сбросить поиск и сортировку
          </button>
        </div>

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : (
          <>
            <div className="data-table-panel">
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-actions" aria-label="Действия">
                      Действия
                    </th>
                    {gridColumns &&
                      gridColumns.map((col) => {
                        const ind =
                          ui.sortColumn === col.key
                            ? ui.sortDirection === "asc"
                              ? "▲"
                              : "▼"
                            : "⇅";
                        const w = getColWidth(col.key);
                        return (
                          <th
                            key={col.key}
                            style={{ width: w, minWidth: 64 }}
                            className={ui.sortColumn === col.key ? "th-sorted" : undefined}
                            onClick={() => sortHeaderClick(col.key)}
                          >
                            <span className="th-label">
                              {col.label} <span className="sort-icon">{ind}</span>
                            </span>
                            <span
                              className="col-resize-handle"
                              role="separator"
                              aria-hidden
                              title="Потяните, чтобы изменить ширину столбца"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                beginColumnResize(col.key, e.clientX);
                              }}
                            />
                          </th>
                        );
                      })}
                  </tr>
                </thead>
                <tbody>
                  {isGridSection(section) &&
                    gridColumns &&
                    displayRows.map((row, rowIndex) => {
                      const sid = section as GridSectionId;
                      const idx = resolveGridRowIndex(row, sid);
                      const idf = idFieldForSection(sid);
                      const rid = row[idf];
                      return (
                        <tr key={`grid-${sid}-${rowIndex}-${str(row[idf])}`}>
                          <td className="col-actions">
                            {hasGridCard(sid) ? (
                              <button
                                type="button"
                                className="table-icon-btn table-icon-card"
                                title="Паспорт"
                                aria-label="Паспорт"
                                onClick={() => {
                                  setGridCard({
                                    section: sid,
                                    mode: "edit",
                                    rowIndex: idx,
                                    draft: { ...row },
                                  });
                                }}
                              >
                                <IconCard />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="table-icon-btn table-icon-danger"
                              title="Удалить"
                              aria-label="Удалить"
                              onClick={() => void deleteRow(sid, row)}
                            >
                              <IconTrash />
                            </button>
                          </td>
                          {gridColumns.map((col) => {
                            const gcw = getColWidth(col.key);
                            const autoFill =
                              sid === "magazin-trash" &&
                              typeof rid === "number" &&
                              rid > 0 &&
                              magazinAutoCells[`${rid}::${col.key}`];
                            const autoTd = autoFill ? " cell-auto-filled" : "";
                            if (col.gridRef) {
                              const gk = col.gridRef;
                              const spec = GRID_REF_SPECS[gk];
                              const val = gridCellValue(row, col, gridRefLists);
                              const sug = gridRefLists[gk].filter((r) =>
                                spec
                                  .display(r)
                                  .toLowerCase()
                                  .includes((editingGridRef?.filter ?? "").toLowerCase())
                              );
                              const showAc =
                                editingGridRef?.kind === gk &&
                                editingGridRef.rowIndex === idx &&
                                editingGridRef.colKey === col.key &&
                                editingGridRef.filter.length > 0;
                              return (
                                <td
                                  key={col.key}
                                  className={`reference-cell${autoTd}`}
                                  style={{ width: gcw, minWidth: 64 }}
                                >
                                  {editingGridRef?.kind === gk &&
                                  editingGridRef.rowIndex === idx &&
                                  editingGridRef.colKey === col.key ? (
                                    <div className="cell-editor" style={{ position: "relative" }}>
                                      <input
                                        className="autocomplete-input cell-input-minimal"
                                        autoFocus
                                        value={editingGridRef.filter}
                                        placeholder="Введите или выберите..."
                                        onChange={(e) =>
                                          setEditingGridRef({
                                            kind: gk,
                                            rowIndex: idx,
                                            colKey: col.key,
                                            filter: e.target.value,
                                          })
                                        }
                                        onBlur={() =>
                                          setTimeout(() => setEditingGridRef(null), 150)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") setEditingGridRef(null);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="table-icon-btn"
                                        title="Открыть справочник"
                                        aria-label="Открыть справочник"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() =>
                                          setGridRefModal({
                                            kind: gk,
                                            rowIndex: idx,
                                            colKey: col.key,
                                            section: sid,
                                            target: "table",
                                          })
                                        }
                                      >
                                        <IconPencil />
                                      </button>
                                      {showAc && (spec.nullable || sug.length > 0) && (
                                        <div
                                          className="autocomplete-list"
                                          style={{
                                            position: "absolute",
                                            top: "100%",
                                            left: 0,
                                            right: 32,
                                          }}
                                        >
                                          {spec.nullable ? (
                                            <div
                                              className="autocomplete-item autocomplete-item-clear"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() =>
                                                void applyGridFkClear(idx, col.key, sid)
                                              }
                                            >
                                              — Не выбрано
                                            </div>
                                          ) : null}
                                          {sug.slice(0, 12).map((s) => (
                                            <div
                                              key={str(s[spec.idField])}
                                              className="autocomplete-item"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() =>
                                                void applyGridFkAndSave(idx, col.key, s, sid)
                                              }
                                            >
                                              {spec.display(s)}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                      }}
                                      onClick={() =>
                                        setEditingGridRef({
                                          kind: gk,
                                          rowIndex: idx,
                                          colKey: col.key,
                                          filter: val,
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ")
                                          setEditingGridRef({
                                            kind: gk,
                                            rowIndex: idx,
                                            colKey: col.key,
                                            filter: val,
                                          });
                                      }}
                                    >
                                      <span>
                                        {val || (
                                          <span className="cell-placeholder">[выбрать]</span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        className="cell-ref-action table-icon-btn"
                                        title="Открыть справочник"
                                        aria-label="Открыть справочник"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setGridRefModal({
                                            kind: gk,
                                            rowIndex: idx,
                                            colKey: col.key,
                                            section: sid,
                                            target: "table",
                                          });
                                        }}
                                      >
                                        <IconPencil />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            if (col.readOnly || col.format) {
                              return (
                                <td
                                  key={col.key}
                                  className={autoFill ? "cell-auto-filled" : undefined}
                                  style={{ width: gcw, minWidth: 64 }}
                                >
                                  {col.format ? col.format(row) : gridCellValue(row, col)}
                                </td>
                              );
                            }
                            if (col.type === "bool") {
                              const v = gridCellValue(row, col);
                              return (
                                <td
                                  key={col.key}
                                  className={autoFill ? "cell-auto-filled" : undefined}
                                  style={{ width: gcw, minWidth: 64 }}
                                >
                                  <select
                                    key={`${str(row[idf])}-${col.key}-${str(row[col.key])}`}
                                    className="filter-select cell-select-minimal"
                                    style={{ width: "100%" }}
                                    defaultValue={v}
                                    onChange={(e) => {
                                      if (
                                        sid === "magazin-trash" &&
                                        typeof rid === "number" &&
                                        rid > 0
                                      ) {
                                        clearMagazinAutoCell(rid, col.key);
                                      }
                                      const next = {
                                        ...row,
                                        [col.key]: parseGridInput(e.target.value, col, row),
                                      };
                                      void saveGridRow(next, idx, sid);
                                    }}
                                  >
                                    <option value="">—</option>
                                    <option value="Да">Да</option>
                                    <option value="Нет">Нет</option>
                                  </select>
                                </td>
                              );
                            }
                            if (col.type === "date") {
                              return (
                                <td
                                  key={col.key}
                                  className={autoFill ? "cell-auto-filled" : undefined}
                                  style={{ width: gcw, minWidth: 64 }}
                                >
                                  <DateField
                                    key={`${str(row[idf])}-${col.key}-${str(row[col.key])}`}
                                    value={row[col.key]}
                                    inputClassName="cell-input-minimal date-field-text"
                                    onChange={(iso) => {
                                      if (
                                        sid === "magazin-trash" &&
                                        typeof rid === "number" &&
                                        rid > 0
                                      ) {
                                        clearMagazinAutoCell(rid, col.key);
                                      }
                                      const next = {
                                        ...row,
                                        [col.key]: iso || null,
                                      };
                                      void saveGridRow(next, idx, sid);
                                    }}
                                  />
                                </td>
                              );
                            }
                            if (
                              gridColumns.length === 1 &&
                              !col.gridRef &&
                              !col.readOnly &&
                              !col.format
                            ) {
                              const defVal = gridInputDefault(row, col);
                              return (
                                <td
                                  key={col.key}
                                  className={autoFill ? "cell-auto-filled" : undefined}
                                  style={{ width: gcw, minWidth: 64 }}
                                >
                                  <textarea
                                    key={`${str(row[idf])}-${col.key}-${defVal}`}
                                    className="cell-textarea"
                                    defaultValue={defVal}
                                    rows={2}
                                    onBlur={(e) => {
                                      const next = {
                                        ...row,
                                        [col.key]: parseGridInput(e.target.value, col, row),
                                      };
                                      void saveGridRow(next, idx, sid);
                                    }}
                                  />
                                </td>
                              );
                            }
                            const defVal = gridInputDefault(row, col);
                            return (
                              <td
                                key={col.key}
                                className={autoFill ? "cell-auto-filled" : undefined}
                                style={{ width: gcw, minWidth: 64 }}
                              >
                                <input
                                  key={`${str(row[idf])}-${col.key}-${defVal}`}
                                  className="cell-input-minimal"
                                  defaultValue={defVal}
                                  type={
                                    col.type === "number"
                                      ? "number"
                                      : col.type === "float"
                                        ? "text"
                                        : "text"
                                  }
                                  onBlur={(e) => {
                                    if (
                                      sid === "magazin-trash" &&
                                      typeof rid === "number" &&
                                      rid > 0
                                    ) {
                                      clearMagazinAutoCell(rid, col.key);
                                    }
                                    const next = {
                                      ...row,
                                      [col.key]: parseGridInput(e.target.value, col, row),
                                    };
                                    void saveGridRow(next, idx, sid);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                  {displayRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={colCount + 1}
                        style={{ textAlign: "center", padding: 40 }}
                      >
                        Нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-pager">
              <span className="table-pager-info">
                Стр. {safePage} из {totalPages} · всего {Math.max(0, totalElements)}
              </span>
              <label className="table-pager-size">
                На странице
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="table-pager-nav" role="navigation" aria-label="Страницы таблицы">
                <button type="button" className="table-page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>
                  «
                </button>
                <button
                  type="button"
                  className="table-page-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="table-page-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ›
                </button>
                <button
                  type="button"
                  className="table-page-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  »
                </button>
              </div>
            </div>
            </div>
          </>
        )}
          </>
        )}
      </main>

      {refModal && (
        <ReferenceModal
          kind={refModal.kind}
          rows={
            refModal.kind === "cities"
              ? (() => {
                  const refRow =
                    refModal.rowIndex === OBJECT_CREATE_ROW_INDEX
                      ? objectCreateDraft
                      : rows[refModal.rowIndex];
                  if (!refRow || typeof refRow !== "object") return refCache.cities;
                  return refCache.cities.filter((c) =>
                    cityMatchesRegion(c, resolveObjectRegionId(refRow))
                  );
                })()
              : refCache[refModal.kind]
          }
          regions={regionsList}
          districts={districtsList}
          selectedRows={
            refModal.kind === "magazin" &&
            refModal.rowIndex === OBJECT_CREATE_ROW_INDEX &&
            objectCreateDraft
              ? (Array.isArray(objectCreateDraft.__draftMagazin)
                  ? (objectCreateDraft.__draftMagazin as Record<string, unknown>[])
                  : [])
              : refModal.kind === "magazin" &&
                  rows[refModal.rowIndex] &&
                  typeof rows[refModal.rowIndex].id_object_place_trash === "number"
                ? (() => {
                  const oid = rows[refModal.rowIndex].id_object_place_trash as number;
                  const ids = new Set<number>();
                  const selected: Record<string, unknown>[] = [];
                  for (const c of characteristicTrashList) {
                    if (characteristicObjectPlaceId(c) !== oid) continue;
                    const mid = characteristicMagazinId(c);
                    if (typeof mid !== "number" || ids.has(mid)) continue;
                    ids.add(mid);
                    const nested = magazinFromCharacteristic(c);
                    if (nested) {
                      selected.push(nested);
                      continue;
                    }
                    const fromCache = refCache.magazin.find(
                      (m) => getNestedId(m, "id_magazin_trash") === mid
                    );
                    if (fromCache) selected.push(fromCache);
                  }
                  return selected;
                })()
              : []
          }
          onClose={() => setRefModal(null)}
          onPick={(id) => void pickRef(refModal.kind, refModal.rowIndex, id)}
          onClear={() => void clearRef(refModal.kind, refModal.rowIndex)}
          onDeleteSelected={(id) =>
            refModal.rowIndex === OBJECT_CREATE_ROW_INDEX
              ? unlinkMagazinFromCreateDraft(id)
              : void unlinkMagazinFromObject(refModal.rowIndex, id)
          }
          onCreate={(created) => mergeRefIntoCache(refModal.kind, created)}
          showToast={showToast}
        />
      )}

      {gridRefModal && (
        <GridReferenceModal
          kind={gridRefModal.kind}
          rows={gridRefLists[gridRefModal.kind]}
          onClose={() => setGridRefModal(null)}
          onPick={(picked) => {
            if (gridRefModal.target === "card") {
              applyGridFkToCardDraft(gridRefModal.colKey, picked);
            } else if (gridRefModal.rowIndex !== undefined) {
              void applyGridFkAndSave(
                gridRefModal.rowIndex,
                gridRefModal.colKey,
                picked,
                gridRefModal.section
              );
            }
          }}
          onCreated={(created) => mergeGridRefIntoCache(gridRefModal.kind, created)}
          showToast={showToast}
          allowClear={GRID_REF_SPECS[gridRefModal.kind].nullable === true}
          onClear={() => {
            if (gridRefModal.target === "card") {
              applyGridFkToCardDraft(gridRefModal.colKey, null);
            } else if (gridRefModal.rowIndex !== undefined) {
              void applyGridFkClear(
                gridRefModal.rowIndex,
                gridRefModal.colKey,
                gridRefModal.section
              );
            }
          }}
        />
      )}

      {phoneModal?.target === "create" && objectCreateDisplay && (
        <PhoneModal
          row={objectCreateDisplay}
          phoneKind={phoneModal.kind}
          allPhones={allPhones}
          onClose={() => setPhoneModal(null)}
          onRefresh={async () => {}}
          onRefreshAll={loadAllPhones}
          onLinkExisting={async () => {}}
          showToast={showToast}
          draftLocal={{
            onAdd: (number) => addDraftPhone(number, phoneModal.kind),
            onRemove: removeDraftPhone,
            onLinkExisting: (phoneId, numberValue) =>
              linkDraftPhone(phoneId, numberValue, phoneModal.kind),
          }}
        />
      )}

      {phoneModal?.target === "row" &&
        rows[phoneModal.rowIndex] &&
        typeof rows[phoneModal.rowIndex].id_object_place_trash === "number" && (
          <PhoneModal
            row={rows[phoneModal.rowIndex]}
            phoneKind={phoneModal.kind}
            allPhones={allPhones}
            onClose={() => setPhoneModal(null)}
            onRefresh={async () => {
              const r = rows[phoneModal.rowIndex];
              const id = r?.id_object_place_trash;
              if (typeof id === "number") await refreshObjectRow(id);
            }}
            onRefreshAll={loadAllPhones}
            onLinkExisting={async (phoneId, numberValue) => {
              await linkExistingPhoneToObject(
                phoneModal.rowIndex,
                phoneId,
                numberValue,
                phoneModal.kind
              );
            }}
            showToast={showToast}
          />
        )}

      {gridCard && (
        <GridCardModal
          mode={gridCard.mode}
          title={
            gridCard.mode === "create"
              ? gridCard.section === "magazin-trash"
                ? "Новый отход"
                : "Новая характеристика отхода"
              : gridCard.section === "magazin-trash"
                ? `Отход — ${gridCellValue(gridCard.draft, { key: "name_trash", label: "" }, gridRefLists) || gridCellValue(gridCard.draft, { key: "code_trash", label: "" }, gridRefLists) || "карточка"}`
                : `Характеристика отхода — ${gridCellValue(gridCard.draft, { key: "__register", label: "", gridRef: "objectPlaceTrash" }, gridRefLists) || "карточка"}`
          }
          draft={gridCard.draft}
          columns={getGridDef(gridCard.section).columns}
          getCellValue={(row, col) => gridCellValue(row, col, gridRefLists)}
          onClose={() => setGridCard(null)}
          onDraftChange={onGridCardDraftChange}
          onOpenGridRef={openGridRefFromCard}
          onSubmit={() => void submitGridCard()}
          submitting={gridCardSubmitting}
        />
      )}

      {objectCreateDisplay && (
        <ObjectCardModal
          mode="create"
          row={objectCreateDisplay}
          onClose={() => setObjectCreateDraft(null)}
          getCellValue={getObjectCellValue}
          onFieldChange={onObjectCreateFieldChange}
          onOpenRef={(kind, colKey) =>
            openRefModal(kind, OBJECT_CREATE_ROW_INDEX, colKey)
          }
          onOpenPhones={(kind) => setPhoneModal({ target: "create", kind })}
          onOpenRelation={(kind) => {
            setRelationModal({ target: "create", kind });
            void loadGlobalRelationLists();
          }}
          onSubmit={() => void submitObjectCreate()}
          submitting={objectCreateSubmitting}
        />
      )}

      {objectCardRowIndex !== null && objectCardEditDisplay && (
        <ObjectCardModal
          mode="edit"
          row={objectCardEditDisplay}
          onClose={() => {
            setObjectCardRowIndex(null);
            setObjectCardEditDraft(null);
          }}
          getCellValue={getObjectCellValue}
          onFieldChange={onObjectEditFieldChange}
          onOpenRef={(kind, colKey) => openRefModal(kind, objectCardRowIndex, colKey)}
          onOpenPhones={(kind) =>
            setPhoneModal({ target: "row", rowIndex: objectCardRowIndex, kind })
          }
          onOpenRelation={(kind) => {
            setRelationModal({ target: "row", rowIndex: objectCardRowIndex, kind });
            void loadObjectRelation(objectCardRowIndex, kind);
            void loadGlobalRelationLists();
          }}
          onSubmit={() => void submitObjectEdit()}
          submitting={objectEditSubmitting}
        />
      )}

      {relationModal?.target === "create" && objectCreateDisplay && (
        <RelationModal
          title={
            relationModal.kind === "around"
              ? "Окружающие здания"
              : "Природоохранные здания"
          }
          linkedRows={
            (objectCreateDisplay[
              relationModal.kind === "around" ? "aroundBuilds" : "naturalSaveBuildings"
            ] as Record<string, unknown>[]) ?? []
          }
          allRows={
            relationModal.kind === "around" ? allAroundBuilds : allNaturalBuilds
          }
          itemIdKey={
            relationModal.kind === "around" ? "id_around_build" : "id_natual_save_build"
          }
          onClose={() => setRelationModal(null)}
          onAdd={async (name) => {
            addDraftRelation(relationModal.kind, name);
          }}
          onDelete={async (itemId) => {
            const key = draftRelationKey(relationModal.kind);
            const list = (objectCreateDisplay[key] as Record<string, unknown>[]) ?? [];
            const item = list.find(
              (it) =>
                Number(it[relationModal.kind === "around" ? "id_around_build" : "id_natual_save_build"]) ===
                itemId
            );
            if (item) deleteDraftRelationItem(relationModal.kind, item);
          }}
          onLinkExisting={async (itemId) => {
            linkDraftRelation(relationModal.kind, itemId);
          }}
          draftLocal={{
            onDeleteItem: (item) => deleteDraftRelationItem(relationModal.kind, item),
          }}
        />
      )}

      {relationModal?.target === "row" &&
        rows[relationModal.rowIndex] &&
        typeof rows[relationModal.rowIndex].id_object_place_trash === "number" && (
          <RelationModal
            title={
              relationModal.kind === "around"
                ? "Окружающие здания"
                : "Природоохранные здания"
            }
            linkedRows={
              (rows[relationModal.rowIndex][
                relationModal.kind === "around"
                  ? "aroundBuilds"
                  : "naturalSaveBuildings"
              ] as Record<string, unknown>[]) ?? []
            }
            allRows={
              relationModal.kind === "around" ? allAroundBuilds : allNaturalBuilds
            }
            itemIdKey={
              relationModal.kind === "around"
                ? "id_around_build"
                : "id_natual_save_build"
            }
            onClose={() => setRelationModal(null)}
            onAdd={async (name) => {
              await addObjectRelation(relationModal.rowIndex, relationModal.kind, name);
            }}
            onDelete={async (itemId) => {
              await deleteObjectRelation(relationModal.rowIndex, relationModal.kind, itemId);
            }}
            onLinkExisting={async (itemId) => {
              await linkExistingObjectRelation(
                relationModal.rowIndex,
                relationModal.kind,
                itemId
              );
            }}
          />
        )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
