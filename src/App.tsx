import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  formatCity,
  formatComment,
  formatDegree,
  formatGroupPlace,
  formatStorage,
  objectPlaceTrashToRequest,
} from "./api";
import {
  GRID_SECTION_ORDER,
  OBJECT_SECTION,
  type GridSectionId,
  type SectionId,
  type SimpleCol,
  getGridDef,
  gridCellValue,
  isGridSection,
  pickFk,
} from "./sectionsConfig";

const COL_WIDTHS_LS = "eco-service-col-widths";
const DEFAULT_COL_WIDTH = 148;

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

type RefKind = "cities" | "group" | "storage" | "degree" | "comments";

const REF_CONFIG: Record<
  RefKind,
  {
    title: string;
    path: string;
    patchKey: "citiesId" | "groupPlaceSaveId" | "storageSchemeId" | "gruopsDegreeId" | "commentsOfPlaceId";
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
  group: {
    title: "Группы мест сохранения",
    path: "/api/group-place-save",
    patchKey: "groupPlaceSaveId",
    display: (r) => String(r.name_region ?? ""),
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
  comments: {
    title: "Комментарии",
    path: "/api/comments-of-place",
    patchKey: "commentsOfPlaceId",
    display: (r) => String(r.comments ?? "").slice(0, 80),
    primaryHeader: "Комментарий",
  },
};

type ObjectCol = {
  key: string;
  label: string;
  ref?: RefKind;
  editable?: boolean;
  type?: "text" | "number" | "date" | "bool" | "float";
};

/** Все поля сущности ObjectPlaceTrash + связи (колонка ID скрыта в UI) */
const OBJECT_COLUMNS: ObjectCol[] = [
  { key: "id_registration", label: "Рег. идентификатор (10)", editable: true },
  { key: "register", label: "Рег. номер (int)", editable: true, type: "number" },
  { key: "date_register", label: "Дата регистрации", editable: true, type: "date" },
  { key: "__city", label: "Город (Cities)", ref: "cities" },
  { key: "__group", label: "Группа места (GroupPlaceSave)", ref: "group" },
  { key: "__storage", label: "Схема хранения (StorageScheme)", ref: "storage" },
  { key: "__degree", label: "Степень группы (GruopsDegree)", ref: "degree" },
  { key: "__phones", label: "Телефоны (NumberPhone[])", editable: false },
  { key: "__comments", label: "Комментарий (CommentsOfPlace)", ref: "comments" },
  { key: "name_obj", label: "name_obj — название объекта", editable: true },
  { key: "name_own", label: "name_own — владелец", editable: true },
  { key: "start_use", label: "start_use — год ввода", editable: true, type: "number" },
  { key: "servise_life", label: "servise_life — срок службы", editable: true },
  { key: "company_located", label: "company_located — орг. на территории", editable: true },
  { key: "place_obj", label: "place_obj — местоположение", editable: true },
  { key: "project", label: "project", editable: true },
  { key: "state_expertize", label: "state_expertize — экспертиза", editable: true, type: "bool" },
  { key: "eco_pasport", label: "eco_pasport", editable: true },
  { key: "prava_place", label: "prava_place — права на участок", editable: true },
  { key: "confirmation_use", label: "confirmation_use — подтв. использования", editable: true, type: "bool" },
  { key: "square", label: "square — площадь, м²", editable: true, type: "float" },
  { key: "use_square", label: "use_square — использ. площадь", editable: true, type: "float" },
  { key: "trash_square", label: "trash_square — площадь под отходы", editable: true, type: "float" },
  { key: "project_power", label: "project_power — проектная мощность", editable: true },
  { key: "facticheskay_power", label: "facticheskay_power — факт. мощность", editable: true },
  { key: "accomulated_trash", label: "accomulated_trash — накопл. отходы", editable: true },
  { key: "type_grounds", label: "type_grounds — тип грунтов", editable: true },
  { key: "ander_water", label: "ander_water — грунтовые воды", editable: true },
  { key: "observation_hole", label: "observation_hole — набл. скважина", editable: true },
  { key: "date_axclute", label: "date_axclute — дата исключения", editable: true, type: "date" },
  { key: "reson_axclute", label: "reson_axclute — причина исключения", editable: true },
  { key: "status", label: "status — активен", editable: true, type: "bool" },
];

const OBJECT_BOOL_KEYS = new Set(["status", "state_expertize", "confirmation_use"]);

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatPhones(row: Record<string, unknown>): string {
  const p = row.phones;
  if (!Array.isArray(p) || p.length === 0) return "";
  return p
    .map((x) => (x && typeof x === "object" ? str((x as Record<string, unknown>).number) : ""))
    .filter(Boolean)
    .join(", ");
}

function getObjectCellValue(row: Record<string, unknown>, key: string): string {
  switch (key) {
    case "__city":
      return formatCity(row.id_cities);
    case "__group":
      return formatGroupPlace(row.id_group_place_save);
    case "__storage":
      return formatStorage(row.id_storage_scheme);
    case "__degree":
      return formatDegree(row.id_gruops_degree);
    case "__comments":
      return formatComment(row.id_comments_of_place);
    case "__phones":
      return formatPhones(row);
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
  cellValue: (row: Record<string, unknown>, col: string) => string
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
  return gridCellValue(row, col);
}

function parseGridInput(
  raw: string,
  col: SimpleCol,
  row: Record<string, unknown>
): unknown {
  if (col.type === "number") {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? row[col.key] : n;
  }
  if (col.type === "float") {
    const n = parseFloat(raw.replace(",", "."));
    return Number.isNaN(n) ? row[col.key] : n;
  }
  if (col.type === "bool") {
    return raw === "Да" || raw === "true" || raw === "1";
  }
  return raw;
}

function ReferenceModal(props: {
  kind: RefKind;
  rows: Record<string, unknown>[];
  regions: Record<string, unknown>[];
  onClose: () => void;
  onPick: (id: number) => void;
  onCreate: (created: Record<string, unknown>) => void;
  showToast: (msg: string) => void;
}) {
  const cfg = REF_CONFIG[props.kind];
  const [newVal, setNewVal] = useState("");
  const [cityIndex, setCityIndex] = useState("");
  const [cityDistrict, setCityDistrict] = useState("");
  const [cityRegionId, setCityRegionId] = useState<number>(() => {
    const r = props.regions[0];
    return r && typeof r.id_region === "number" ? r.id_region : 1;
  });

  const idKey =
    props.kind === "cities"
      ? "id_cities"
      : props.kind === "group"
        ? "id_group_place_save"
        : props.kind === "storage"
          ? "id_storage_scheme"
          : props.kind === "degree"
            ? "id_gruops_degree"
            : "id_comments_of_place";

  const add = async () => {
    try {
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
      if (props.kind === "comments") {
        const created = await apiPost<Record<string, unknown>>(cfg.path, {
          comments: newVal.trim(),
        });
        props.onCreate(created);
        props.showToast("Комментарий добавлен");
        props.onPick(Number(created.id_comments_of_place));
        return;
      }
      if (props.kind === "cities") {
        const created = await apiPost<Record<string, unknown>>(cfg.path, {
          idRegion: cityRegionId,
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
          <span>📋 Выбор: {cfg.title}</span>
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
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {props.kind === "cities" ? (
              <>
                <input
                  className="normal-input"
                  placeholder="Индекс"
                  value={cityIndex}
                  onChange={(e) => setCityIndex(e.target.value)}
                />
                <input
                  className="normal-input"
                  placeholder="Район"
                  value={cityDistrict}
                  onChange={(e) => setCityDistrict(e.target.value)}
                />
                <select
                  className="filter-select"
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
                className="normal-input"
                placeholder="Новое значение..."
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void add()}
              />
            )}
            <button type="button" className="btn-small" style={{ alignSelf: "flex-start" }} onClick={() => void add()}>
              Добавить и выбрать
            </button>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="modal-table">
              <thead>
                <tr>
                  <th>{cfg.primaryHeader}</th>
                  {props.kind === "cities" && (
                    <>
                      <th>Индекс</th>
                      <th>Район</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {props.rows.length === 0 ? (
                  <tr>
                    <td colSpan={3}>Нет данных</td>
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
    (colKey: string) => colWidths[widthStorageKey(colKey)] ?? DEFAULT_COL_WIDTH,
    [colWidths, widthStorageKey]
  );

  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;

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
    group: [],
    storage: [],
    degree: [],
    comments: [],
  });
  const [regionsList, setRegionsList] = useState<Record<string, unknown>[]>([]);

  const [refModal, setRefModal] = useState<{
    kind: RefKind;
    rowIndex: number;
  } | null>(null);

  const [editingRef, setEditingRef] = useState<{
    kind: RefKind;
    rowIndex: number;
    filter: string;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const loadRefs = useCallback(async () => {
    try {
      const [cities, group, storage, degree, comments, regions] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/cities"),
        apiGet<Record<string, unknown>[]>("/api/group-place-save"),
        apiGet<Record<string, unknown>[]>("/api/storage-scheme"),
        apiGet<Record<string, unknown>[]>("/api/gruops-degree"),
        apiGet<Record<string, unknown>[]>("/api/comments-of-place"),
        apiGet<Record<string, unknown>[]>("/api/region"),
      ]);
      setRefCache({ cities, group, storage, degree, comments });
      setRegionsList(regions);
    } catch {
      /* ignore */
    }
  }, []);

  const loadSection = useCallback(async (s: SectionId) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Record<string, unknown>[]>(apiPathForSection(s));
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setRows([]);
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

  const objectColumnKeys = useMemo(() => OBJECT_COLUMNS.map((c) => c.key), []);

  const gridColumns = isGridSection(section) ? getGridDef(section).columns : null;

  const displayRows = useMemo(() => {
    if (section === "objects") {
      return filterAndSortData(rows, objectColumnKeys, ui, getObjectCellValue);
    }
    if (gridColumns) {
      const keys = gridColumns.map((c) => c.key);
      return filterAndSortData(rows, keys, ui, (r, k) => {
        const col = gridColumns.find((c) => c.key === k);
        return col ? gridCellValue(r, col) : "";
      });
    }
    return rows;
  }, [rows, section, gridColumns, objectColumnKeys, ui]);

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
      const n = parseInt(raw, 10);
      patch[key] = Number.isNaN(n) ? row[key] : n;
    } else if (type === "float") {
      const n = parseFloat(raw.replace(",", "."));
      patch[key] = Number.isNaN(n) ? row[key] : n;
    } else if (type === "bool") {
      patch[key] = raw === "Да" || raw === "true" || raw === "1";
    } else if (type === "date") {
      patch[key] = raw || null;
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

  const openRefModal = (kind: RefKind, rowIndex: number) => {
    setRefModal({ kind, rowIndex });
    void loadRefs();
  };

  const pickRef = async (kind: RefKind, rowIndex: number, id: number) => {
    setRefModal(null);
    const patchKey = REF_CONFIG[kind].patchKey;
    await saveObjectPatch(rowIndex, { [patchKey]: id });
  };

  const deleteRow = async (s: SectionId, row: Record<string, unknown>) => {
    const idf = idFieldForSection(s);
    const id = row[idf];
    if (typeof id !== "number") return;
    if (!window.confirm("Удалить запись?")) return;
    try {
      await apiDelete(`${apiPathForSection(s)}/${id}`);
      showToast("Удалено");
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
      await apiPost(def.apiPath, body);
      showToast("Строка добавлена");
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
    if (typeof id !== "number") return;
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
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
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
        <div className="sidebar-header">📋 Все таблицы API</div>
        <nav className="table-list">
          <button
            type="button"
            className={`table-item ${section === "objects" ? "active" : ""}`}
            onClick={() => switchSection("objects")}
          >
            <span>{OBJECT_SECTION.icon}</span>
            <span>{OBJECT_SECTION.sidebar}</span>
          </button>
          {GRID_SECTION_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={`table-item ${section === id ? "active" : ""}`}
              onClick={() => switchSection(id)}
            >
              <span>{getGridDef(id).icon}</span>
              <span>{getGridDef(id).sidebar}</span>
            </button>
          ))}
        </nav>
        <div className="info-note" style={{ margin: "12px" }}>
          🔍 Поиск по строке и сортировка по столбцу. Ширину столбца меняйте перетаскиванием правого края заголовка.
          <br />
          <br />
          <a
            className="toolbar-link"
            href="/api/reports/waste/export/csv"
            target="_blank"
            rel="noreferrer"
          >
            Экспорт отчёта CSV
          </a>
        </div>
      </aside>

      <main className="main-content">
        <h1 className="page-title">{pageTitle}</h1>

        {error && <div className="error-banner">{error}</div>}

        <div className="toolbar">
          <div className="search-box">
            <span>🔍</span>
            <input
              type="search"
              placeholder="Поиск по всем полям таблицы..."
              value={ui.searchQuery}
              onChange={(e) => setUi((p) => ({ ...p, searchQuery: e.target.value }))}
            />
          </div>
          <button type="button" className="clear-filters" onClick={clearFilters}>
            ✖ Сбросить поиск и сортировку
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
                    displayRows.map((row) => {
                      const idx = resolveObjectRowIndex(row);
                      return (
                        <tr key={str(row.id_object_place_trash)}>
                          {OBJECT_COLUMNS.map((col) => {
                            const cw = getColWidth(col.key);
                            if (col.ref) {
                              const rk = col.ref;
                              const val = getObjectCellValue(row, col.key);
                              const sug = refCache[rk].filter((r) =>
                                REF_CONFIG[rk]
                                  .display(r)
                                  .toLowerCase()
                                  .includes((editingRef?.filter ?? "").toLowerCase())
                              );
                              const showAc =
                                editingRef?.kind === rk &&
                                editingRef.rowIndex === idx &&
                                editingRef.filter.length > 0;
                              return (
                                <td
                                  key={col.key}
                                  className="reference-cell"
                                  style={{ width: cw, minWidth: 64 }}
                                >
                                  {editingRef?.kind === rk &&
                                  editingRef.rowIndex === idx ? (
                                    <div className="cell-editor" style={{ position: "relative" }}>
                                      <input
                                        className="autocomplete-input"
                                        autoFocus
                                        value={editingRef.filter}
                                        placeholder="Введите или выберите..."
                                        onChange={(e) =>
                                          setEditingRef({
                                            kind: rk,
                                            rowIndex: idx,
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
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => openRefModal(rk, idx)}
                                      >
                                        📋
                                      </button>
                                      {showAc && sug.length > 0 && (
                                        <div
                                          className="autocomplete-list"
                                          style={{ position: "absolute", top: "100%", left: 0, right: 28 }}
                                        >
                                          {sug.slice(0, 12).map((s) => {
                                            const idKey =
                                              rk === "cities"
                                                ? "id_cities"
                                                : rk === "group"
                                                  ? "id_group_place_save"
                                                  : rk === "storage"
                                                    ? "id_storage_scheme"
                                                    : rk === "degree"
                                                      ? "id_gruops_degree"
                                                      : "id_comments_of_place";
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
                                          filter: val,
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ")
                                          setEditingRef({
                                            kind: rk,
                                            rowIndex: idx,
                                            filter: val,
                                          });
                                      }}
                                    >
                                      <span>
                                        {val || (
                                          <span style={{ color: "#94a3b8" }}>[выбрать]</span>
                                        )}
                                      </span>
                                      <span style={{ color: "#2563eb", fontSize: 12 }}>📋</span>
                                    </div>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === "__phones") {
                              const v = getObjectCellValue(row, col.key);
                              return (
                                <td key={col.key} style={{ width: cw, minWidth: 64 }}>
                                  <span className="normal-input" style={{ display: "block", background: "#f8fafc" }}>
                                    {v || "—"}
                                  </span>
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
                                    className="filter-select"
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
                            return (
                              <td key={col.key} style={{ width: cw, minWidth: 64 }}>
                                <input
                                  key={`${str(row.id_object_place_trash)}-${col.key}-${v}`}
                                  className="normal-input"
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
                                  style={!editable ? { background: "#f8fafc" } : undefined}
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
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                  {isGridSection(section) &&
                    gridColumns &&
                    displayRows.map((row) => {
                      const sid = section as GridSectionId;
                      const idx = resolveGridRowIndex(row, sid);
                      const idf = idFieldForSection(sid);
                      return (
                        <tr key={str(row[idf])}>
                          {gridColumns.map((col) => {
                            const gcw = getColWidth(col.key);
                            if (col.readOnly || col.format) {
                              return (
                                <td key={col.key} style={{ width: gcw, minWidth: 64 }}>
                                  {col.format ? col.format(row) : gridCellValue(row, col)}
                                </td>
                              );
                            }
                            if (col.type === "bool") {
                              const v = gridCellValue(row, col);
                              return (
                                <td key={col.key} style={{ width: gcw, minWidth: 64 }}>
                                  <select
                                    key={`${str(row[idf])}-${col.key}-${str(row[col.key])}`}
                                    className="filter-select"
                                    style={{ width: "100%" }}
                                    defaultValue={v}
                                    onChange={(e) => {
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
                            const defVal = gridInputDefault(row, col);
                            return (
                              <td key={col.key} style={{ width: gcw, minWidth: 64 }}>
                                <input
                                  key={`${str(row[idf])}-${col.key}-${defVal}`}
                                  className="normal-input"
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
                              🗑️
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

            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn-small"
                style={{ background: "#e9e9ef", padding: "8px 18px" }}
                onClick={() =>
                  section === "objects"
                    ? void addObjectRow()
                    : isGridSection(section)
                      ? void addGridRow(section)
                      : undefined
                }
              >
                ➕ Добавить строку
              </button>
            </div>

            <div className="info-note">
              Показано {displayRows.length} из {rows.length} записей. Горизонтальная прокрутка — для широких
              таблиц.
            </div>
          </>
        )}
      </main>

      {refModal && (
        <ReferenceModal
          kind={refModal.kind}
          rows={refCache[refModal.kind]}
          regions={regionsList}
          onClose={() => setRefModal(null)}
          onPick={(id) => void pickRef(refModal.kind, refModal.rowIndex, id)}
          onCreate={(created) => mergeRefIntoCache(refModal.kind, created)}
          showToast={showToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
