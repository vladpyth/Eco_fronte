import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FK_CLEAR,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  formatCity,
  formatDegree,
  formatGroupPlace,
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
import {
  OBJECT_COLUMNS,
  type ObjectCol,
  type RefKind,
} from "./objectPlaceColumns";

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
    display: (r) => formatCity(r),
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
    case "__region":
      return formatGroupPlace(row.id_region);
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

function filterAndSortData(
  rows: Record<string, unknown>[],
  columns: string[],
  ui: UiState,
  cellValue: (row: Record<string, unknown>, col: string) => string,
  /** Без явной сортировки по столбцу — новые строки (больший id) сверху. */
  primaryIdField: string
): Record<string, unknown>[] {
  let filtered = [...rows];
  if (ui.searchQuery.trim()) {
    const q = ui.searchQuery.toLowerCase();
    filtered = filtered.filter((row) =>
      columns.some((col) => cellValue(row, col).toLowerCase().includes(q))
    );
  }
  if (ui.sortColumn) {
    const col = ui.sortColumn;
    filtered.sort((a, b) => {
      const av = cellValue(a, col);
      const bv = cellValue(b, col);
      const an = parseFloat(av);
      const bn = parseFloat(bv);
      const isNum = !Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "";
      let cmp: number;
      if (isNum) cmp = an - bn;
      else cmp = av.toLowerCase().localeCompare(bv.toLowerCase());
      return ui.sortDirection === "asc" ? cmp : -cmp;
    });
  } else {
    filtered.sort((a, b) => {
      const av = a[primaryIdField];
      const bv = b[primaryIdField];
      const an = typeof av === "number" ? av : Number(av);
      const bn = typeof bv === "number" ? bv : Number(bv);
      const aOk = Number.isFinite(an);
      const bOk = Number.isFinite(bn);
      if (aOk && bOk) return bn - an;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return 0;
    });
  }
  return filtered;
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
  return raw;
}

function PhoneModal(props: {
  row: Record<string, unknown>;
  phoneKind: PhoneKind;
  allPhones: Record<string, unknown>[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onLinkExisting: (phoneId: number, numberValue: string) => Promise<void>;
  showToast: (msg: string) => void;
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

  const remove = async (id: number) => {
    try {
      if (typeof oid !== "number") return;
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
    if (!t || typeof oid !== "number") return;
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
            className="clear-filters"
            style={{ background: "none", fontSize: "24px", padding: "0 8px" }}
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
                          onClick={() => typeof id === "number" && void remove(id)}
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
                            onClick={() => void props.onLinkExisting(id, str(rec.number))}
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
            className="clear-filters"
            style={{ background: "none", fontSize: "24px", padding: "0 8px" }}
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
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
            className="clear-filters"
            style={{ background: "none", fontSize: "24px", padding: "0 8px" }}
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {props.allowClear && props.onClear ? (
            <div style={{ marginBottom: 12 }}>
              <button type="button" className="btn-small" onClick={() => props.onClear?.()}>
                Сбросить связь
              </button>
            </div>
          ) : null}
          <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input
              className="cell-input-minimal"
              style={{ flex: 1, minWidth: 160 }}
              placeholder={spec.placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
            />
            <button type="button" className="btn-small" onClick={() => void add()}>
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
                    <tr
                      key={str(item[idKey])}
                      style={{ cursor: "pointer" }}
                      onClick={() => props.onPick(item)}
                    >
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
  const [cityDistrict, setCityDistrict] = useState("");
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
          nameCities: cityName.trim() || "Новый город",
          name_cities: cityName.trim() || "Новый город",
          index: cityIndex.trim(),
          district: cityDistrict.trim(),
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
            className="clear-filters"
            style={{ background: "none", fontSize: "24px", padding: "0 8px" }}
            onClick={props.onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="btn-small" onClick={() => props.onClear()}>
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
                  <input
                    className="cell-input-minimal"
                    placeholder="Район"
                    value={cityDistrict}
                    onChange={(e) => setCityDistrict(e.target.value)}
                  />
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
                          <td style={{ color: "#64748b" }}>{str(item.district)}</td>
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

export default function App() {
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
    sortColumn: null,
    sortDirection: "asc",
  });

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

  const [refModal, setRefModal] = useState<{
    kind: RefKind;
    rowIndex: number;
    colKey: string;
  } | null>(null);

  const [gridRefModal, setGridRefModal] = useState<{
    kind: GridRefKind;
    rowIndex: number;
    colKey: string;
    section: GridSectionId;
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

  const [phoneModal, setPhoneModal] = useState<{ rowIndex: number; kind: PhoneKind } | null>(null);
  const [editingRelation, setEditingRelation] = useState<{
    kind: ObjectRelationKind;
    rowIndex: number;
    filter: string;
  } | null>(null);
  const [relationModal, setRelationModal] = useState<{
    kind: ObjectRelationKind;
    rowIndex: number;
  } | null>(null);
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
      if (s === "objects") {
        const data = await apiGet<Record<string, unknown>[]>(apiPathForSection(s));
        setRows(Array.isArray(data) ? data : []);
        try {
          const chars = await apiGet<Record<string, unknown>[]>("/api/characteristic-trash");
          setCharacteristicTrashList(Array.isArray(chars) ? chars : []);
        } catch {
          setCharacteristicTrashList([]);
        }
      } else {
        const data = await apiGet<Record<string, unknown>[]>(apiPathForSection(s));
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setRows([]);
      if (s === "objects") setCharacteristicTrashList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
  }, [section]);

  const objectColumnKeys = useMemo(() => OBJECT_COLUMNS.map((c) => c.key), []);

  const gridColumns = isGridSection(section) ? getGridDef(section).columns : null;

  const gridUsesGridRef = useMemo(
    () => !!(gridColumns && gridColumns.some((c) => c.gridRef)),
    [gridColumns]
  );

  const objectRowsWithMerged = useMemo(() => {
    if (section !== "objects") return rows;
    return mergeCharacteristicsIntoObjectRows(rows, characteristicTrashList);
  }, [section, rows, characteristicTrashList]);

  const displayRows = useMemo(() => {
    const primaryIdField = idFieldForSection(section);
    if (section === "objects") {
      return filterAndSortData(
        objectRowsWithMerged,
        objectColumnKeys,
        ui,
        getObjectCellValue,
        primaryIdField
      );
    }
    if (gridColumns) {
      const keys = gridColumns.map((c) => c.key);
      return filterAndSortData(
        rows,
        keys,
        ui,
        (r, k) => {
          const col = gridColumns.find((c) => c.key === k);
          return col
            ? gridCellValue(r, col, gridUsesGridRef ? gridRefLists : undefined)
            : "";
        },
        primaryIdField
      );
    }
    return rows;
  }, [
    objectRowsWithMerged,
    rows,
    section,
    gridColumns,
    objectColumnKeys,
    ui,
    gridUsesGridRef,
    gridRefLists,
  ]);

  const clearFilters = () =>
    setUi({
      searchQuery: "",
      sortColumn: null,
      sortDirection: "asc",
    });

  const switchSection = (s: SectionId) => {
    setSection(s);
    clearFilters();
  };

  const triggerAddRow = () => {
    if (section === "objects") {
      void addObjectRow();
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
    let patch: Record<string, unknown> = {};
    if (type === "number") {
      const trimmed = raw.trim();
      if (trimmed === "") {
        if (key === "register") return;
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
      patch[key] = raw.trim() === "" ? null : raw;
    } else {
      patch[key] = raw;
    }
    const prevStr = getObjectCellValue(row, key);
    if (type === "bool") {
      const prevBool =
        row[key] === true ? "Да" : row[key] === false ? "Нет" : "";
      if (raw === prevBool) return;
    } else if (str(patch[key]) === prevStr) {
      if (type !== "number" && type !== "date" && type !== "float") return;
    }
    void saveObjectPatch(index, patch);
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

  const addObjectRow = async () => {
    const maxReg = rows.reduce((m, r) => {
      const v = r.register;
      return typeof v === "number" && v > m ? v : m;
    }, 0);
    const stamp = Date.now() % 1e7;
    try {
      await apiPost("/api/object-place-trash", {
        idRegistration: `R${stamp}`.slice(0, 10),
        register: maxReg + 1,
        nameObj: "Новый объект",
        nameOwn: "Владелец",
      });
      showToast("Объект создан");
      await loadSection("objects");
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
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
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
    section === "objects" ? OBJECT_COLUMNS.length : (gridColumns?.length ?? 0);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">Все таблицы API</div>
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
        <div className="info-note" style={{ margin: "12px" }}>
          <a
            className="toolbar-link"
            href="/api/reports/waste/export/csv"
            target="_blank"
            rel="noreferrer"
          >
            Экспорт отчёта CSV
          </a>
          <br />
          <a
            className="toolbar-link"
            href="/api/reports/waste/detailed/export/pdf"
            target="_blank"
            rel="noreferrer"
          >
            Экспорт отчёта PDF
          </a>
        </div>
      </aside>

      <main className="main-content">
        <h1 className="page-title">{pageTitle}</h1>

        {error && <div className="error-banner">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <input
              type="search"
              placeholder="Поиск по всем полям таблицы..."
              value={ui.searchQuery}
              onChange={(e) => setUi((p) => ({ ...p, searchQuery: e.target.value }))}
            />
          </div>
          <button type="button" className="clear-filters" onClick={clearFilters}>
            Сбросить поиск и сортировку
          </button>
        </div>

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : (
          <>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {section === "objects" &&
                      OBJECT_COLUMNS.map((col) => {
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
                    <th className="col-actions" aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {section === "objects" &&
                    displayRows.map((row, rowIndex) => {
                      const idx = resolveObjectRowIndex(row);
                      return (
                        <tr key={`obj-${rowIndex}-${str(row.id_object_place_trash)}`}>
                          {OBJECT_COLUMNS.map((col) => {
                            const cw = getColWidth(col.key);
                            if (col.ref) {
                              const rk = col.ref;
                              const val =
                                rk === "region"
                                  ? (() => {
                                      const raw =
                                        row.id_region ??
                                        (row.id_cities &&
                                        typeof row.id_cities === "object"
                                          ? (row.id_cities as Record<string, unknown>).id_region
                                          : undefined);
                                      if (raw && typeof raw === "object")
                                        return REF_CONFIG.region.display(
                                          raw as Record<string, unknown>
                                        );
                                      const rid =
                                        typeof raw === "number"
                                          ? raw
                                          : getNestedId(raw, "id_region") ??
                                            getNestedId(raw, "idRegion");
                                      if (typeof rid === "number") {
                                        const found = refCache.region.find(
                                          (r) => getNestedId(r, "id_region") === rid
                                        );
                                        if (found) return REF_CONFIG.region.display(found);
                                      }
                                      const cityRaw = row.id_cities;
                                      const cityId =
                                        typeof cityRaw === "number"
                                          ? cityRaw
                                          : cityRaw && typeof cityRaw === "object"
                                            ? getNestedId(cityRaw, "id_cities") ??
                                              getNestedId(cityRaw, "idCities")
                                            : undefined;
                                      if (typeof cityId === "number") {
                                        const city = refCache.cities.find(
                                          (c) => getNestedId(c, "id_cities") === cityId
                                        );
                                        const cityRegion =
                                          city &&
                                          (typeof city.id_region === "number"
                                            ? city.id_region
                                            : getNestedId(city.id_region, "id_region"));
                                        if (typeof cityRegion === "number") {
                                          const found = refCache.region.find(
                                            (r) => getNestedId(r, "id_region") === cityRegion
                                          );
                                          if (found) return REF_CONFIG.region.display(found);
                                        }
                                      }
                                      return "";
                                    })()
                                  : getObjectCellValue(row, col.key);
                              const sug = refCache[rk].filter((r) =>
                                REF_CONFIG[rk]
                                  .display(r)
                                  .toLowerCase()
                                  .includes((editingRef?.filter ?? "").toLowerCase())
                              );
                              const showAc =
                                editingRef?.kind === rk &&
                                editingRef.colKey === col.key &&
                                editingRef.rowIndex === idx &&
                                editingRef.filter.length > 0;
                              return (
                                <td
                                  key={col.key}
                                  className="reference-cell"
                                  style={{ width: cw, minWidth: 64 }}
                                >
                                  {editingRef?.kind === rk &&
                                  editingRef.colKey === col.key &&
                                  editingRef.rowIndex === idx ? (
                                    <div className="cell-editor" style={{ position: "relative" }}>
                                      <input
                                        className="autocomplete-input cell-input-minimal"
                                        autoFocus
                                        value={editingRef.filter}
                                        placeholder="Введите или выберите..."
                                        onChange={(e) =>
                                          setEditingRef({
                                            kind: rk,
                                            rowIndex: idx,
                                            colKey: col.key,
                                            filter: e.target.value,
                                          })
                                        }
                                        onBlur={() =>
                                          setTimeout(() => setEditingRef(null), 150)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") setEditingRef(null);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="table-icon-btn"
                                        title="Открыть справочник"
                                        aria-label="Открыть справочник"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => openRefModal(rk, idx, col.key)}
                                      >
                                        <IconPencil />
                                      </button>
                                      {showAc && sug.length > 0 && (
                                        <div
                                          className="autocomplete-list"
                                          style={{ position: "absolute", top: "100%", left: 0, right: 32 }}
                                        >
                                          <div
                                            className="autocomplete-item autocomplete-item-clear"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => void clearRef(rk, idx)}
                                          >
                                            — Не выбрано
                                          </div>
                                          {sug.slice(0, 12).map((s) => {
                                            const idKey =
                                              rk === "cities"
                                                ? "id_cities"
                                                : rk === "region"
                                                  ? "id_region"
                                                : rk === "group"
                                                  ? "id_group_place_save"
                                                  : rk === "storage"
                                                    ? "id_storage_scheme"
                                                    : rk === "degree"
                                                      ? "id_gruops_degree"
                                                      : "id_magazin_trash";
                                            return (
                                              <div
                                                key={str(s[idKey])}
                                                className="autocomplete-item"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                  void pickRef(rk, idx, Number(s[idKey]));
                                                  setEditingRef(null);
                                                }}
                                              >
                                                {REF_CONFIG[rk].display(s)}
                                              </div>
                                            );
                                          })}
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
                                        setEditingRef({
                                          kind: rk,
                                          rowIndex: idx,
                                          colKey: col.key,
                                          filter: val,
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ")
                                          setEditingRef({
                                            kind: rk,
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
                                          openRefModal(rk, idx, col.key);
                                        }}
                                      >
                                        <IconPencil />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === "__phones" || col.key === "__phones_owner") {
                              const v = getObjectCellValue(row, col.key);
                              const phoneKind: PhoneKind =
                                col.key === "__phones" ? "legal" : "owner";
                              const editingPh =
                                editingPhone?.rowIndex === idx ? editingPhone : null;
                              return (
                                <td
                                  key={col.key}
                                  className="reference-cell"
                                  style={{ width: cw, minWidth: 64 }}
                                >
                                  {editingPh ? (
                                    <div className="cell-editor" style={{ position: "relative" }}>
                                      <input
                                        className="autocomplete-input cell-input-minimal"
                                        autoFocus
                                        value={editingPh.filter}
                                        placeholder="Номер, Enter — добавить"
                                        onChange={(e) =>
                                          setEditingPhone({
                                            rowIndex: idx,
                                            filter: e.target.value,
                                          })
                                        }
                                        onBlur={() =>
                                          setTimeout(() => setEditingPhone(null), 150)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            const t = editingPh.filter.trim();
                                            if (t) void addPhoneForObject(idx, t);
                                            setEditingPhone(null);
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="table-icon-btn"
                                        title="Список телефонов"
                                        aria-label="Список телефонов"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setPhoneModal({ rowIndex: idx, kind: phoneKind });
                                          setEditingPhone(null);
                                        }}
                                      >
                                        <IconPencil />
                                      </button>
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
                                        setEditingPhone({ rowIndex: idx, filter: v })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ")
                                          setEditingPhone({ rowIndex: idx, filter: v });
                                      }}
                                    >
                                      <span>
                                        {v || (
                                          <span className="cell-placeholder">[выбрать]</span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        className="cell-ref-action table-icon-btn"
                                        title="Список телефонов"
                                        aria-label="Список телефонов"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPhoneModal({ rowIndex: idx, kind: phoneKind });
                                        }}
                                      >
                                        <IconPencil />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === "__around" || col.key === "__natural") {
                              const kind: ObjectRelationKind =
                                col.key === "__around" ? "around" : "natural";
                              const v = getObjectCellValue(row, col.key);
                              const editingRel =
                                editingRelation?.rowIndex === idx && editingRelation.kind === kind
                                  ? editingRelation
                                  : null;
                              return (
                                <td
                                  key={col.key}
                                  className="reference-cell"
                                  style={{ width: cw, minWidth: 64 }}
                                >
                                  {editingRel ? (
                                    <div className="cell-editor" style={{ position: "relative" }}>
                                      <input
                                        className="autocomplete-input cell-input-minimal"
                                        autoFocus
                                        value={editingRel.filter}
                                        placeholder="Введите, Enter - добавить"
                                        onFocus={() => void loadObjectRelation(idx, kind)}
                                        onChange={(e) =>
                                          setEditingRelation({
                                            kind,
                                            rowIndex: idx,
                                            filter: e.target.value,
                                          })
                                        }
                                        onBlur={() =>
                                          setTimeout(() => setEditingRelation(null), 150)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            const t = editingRel.filter.trim();
                                            if (t) void addObjectRelation(idx, kind, t);
                                            setEditingRelation(null);
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="table-icon-btn"
                                        title="Список"
                                        aria-label="Список"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setRelationModal({ kind, rowIndex: idx });
                                          void loadObjectRelation(idx, kind);
                                          void loadGlobalRelationLists();
                                          setEditingRelation(null);
                                        }}
                                      >
                                        <IconPencil />
                                      </button>
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
                                        setEditingRelation({
                                          kind,
                                          rowIndex: idx,
                                          filter: "",
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ")
                                          setEditingRelation({
                                            kind,
                                            rowIndex: idx,
                                            filter: "",
                                          });
                                      }}
                                    >
                                      <span>
                                        {v || (
                                          <span className="cell-placeholder">[добавить]</span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        className="cell-ref-action table-icon-btn"
                                        title="Список"
                                        aria-label="Список"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRelationModal({ kind, rowIndex: idx });
                                          void loadObjectRelation(idx, kind);
                                          void loadGlobalRelationLists();
                                        }}
                                      >
                                        <IconPencil />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            const editable = col.editable !== false;
                            const v = getObjectCellValue(row, col.key);
                            if (col.type === "bool") {
                              return (
                                <td key={col.key} style={{ width: cw, minWidth: 64 }}>
                                  <select
                                    key={`${str(row.id_object_place_trash)}-${col.key}-${str(row[col.key])}`}
                                    className="filter-select cell-select-minimal"
                                    style={{ width: "100%" }}
                                    defaultValue={v}
                                    onChange={(e) =>
                                      void onObjectFieldBlur(
                                        idx,
                                        col.key,
                                        e.target.value,
                                        "bool"
                                      )
                                    }
                                  >
                                    <option value="">—</option>
                                    <option value="Да">Да</option>
                                    <option value="Нет">Нет</option>
                                  </select>
                                </td>
                              );
                            }
                            if (col.multiline && editable) {
                              return (
                                <td
                                  key={col.key}
                                  className="td-cell-multiline"
                                  style={{ width: cw, minWidth: 64 }}
                                >
                                  <ObjectCellTextarea
                                    rowId={row.id_object_place_trash as number}
                                    colKey={col.key}
                                    value={v}
                                    readOnly={false}
                                    onCommit={(nv) =>
                                      void onObjectFieldBlur(
                                        idx,
                                        col.key,
                                        nv,
                                        col.type ?? "text"
                                      )
                                    }
                                  />
                                </td>
                              );
                            }
                            return (
                              <td key={col.key} style={{ width: cw, minWidth: 64 }}>
                                <input
                                  key={`${str(row.id_object_place_trash)}-${col.key}-${v}`}
                                  className="cell-input-minimal"
                                  defaultValue={v}
                                  type={
                                    col.type === "number"
                                      ? "number"
                                      : col.type === "float"
                                        ? "text"
                                        : col.type === "date"
                                          ? "date"
                                          : "text"
                                  }
                                  readOnly={!editable}
                                  style={!editable ? { background: "#f4f4f5" } : undefined}
                                  onBlur={(e) =>
                                    editable &&
                                    void onObjectFieldBlur(
                                      idx,
                                      col.key,
                                      e.target.value,
                                      col.type ?? "text"
                                    )
                                  }
                                />
                              </td>
                            );
                          })}
                          <td className="col-actions">
                            <button
                              type="button"
                              className="btn-small"
                              onClick={() => void deleteRow("objects", row)}
                            >
                              Удалить
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                  {isGridSection(section) &&
                    gridColumns &&
                    displayRows.map((row, rowIndex) => {
                      const sid = section as GridSectionId;
                      const idx = resolveGridRowIndex(row, sid);
                      const idf = idFieldForSection(sid);
                      const rid = row[idf];
                      return (
                        <tr key={`grid-${sid}-${rowIndex}-${str(row[idf])}`}>
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
                                        : col.type === "date"
                                          ? "date"
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
                          <td className="col-actions">
                            <button
                              type="button"
                              className="btn-small"
                              onClick={() => void deleteRow(sid, row)}
                            >
                              Удалить
                            </button>
                          </td>
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

            <div className="info-note">
              Показано {displayRows.length} из {rows.length} записей. Горизонтальная прокрутка — для широких
              таблиц.
            </div>
          </>
        )}
        <button type="button" className="floating-add-btn" onClick={triggerAddRow}>
          Добавить строку
        </button>
      </main>

      {refModal && (
        <ReferenceModal
          kind={refModal.kind}
          rows={refCache[refModal.kind]}
          regions={regionsList}
          selectedRows={
            refModal.kind === "magazin" &&
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
          onDeleteSelected={(id) => void unlinkMagazinFromObject(refModal.rowIndex, id)}
          onCreate={(created) => mergeRefIntoCache(refModal.kind, created)}
          showToast={showToast}
        />
      )}

      {gridRefModal && (
        <GridReferenceModal
          kind={gridRefModal.kind}
          rows={gridRefLists[gridRefModal.kind]}
          onClose={() => setGridRefModal(null)}
          onPick={(picked) =>
            void applyGridFkAndSave(
              gridRefModal.rowIndex,
              gridRefModal.colKey,
              picked,
              gridRefModal.section
            )
          }
          onCreated={(created) => mergeGridRefIntoCache(gridRefModal.kind, created)}
          showToast={showToast}
          allowClear={GRID_REF_SPECS[gridRefModal.kind].nullable === true}
          onClear={() =>
            void applyGridFkClear(
              gridRefModal.rowIndex,
              gridRefModal.colKey,
              gridRefModal.section
            )
          }
        />
      )}

      {phoneModal !== null &&
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

      {relationModal !== null &&
        rows[relationModal.rowIndex] &&
        typeof rows[relationModal.rowIndex].id_object_place_trash === "number" && (
          <RelationModal
            title={
              relationModal.kind === "around"
                ? "Природоохранные сооружения"
                : "Населенные пункты"
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
