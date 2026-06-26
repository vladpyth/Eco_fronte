import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiDelete, apiGet, apiPost, apiPut, getNestedId } from "./api";
import { GridCardModal } from "./GridCardModal";
import "./App.css";

const DEFAULT_COL_WIDTH = 148;
const AC_LIST_STYLE = { position: "absolute" as const, top: "100%", left: 0, right: 32 };
const FLEX_ROW = { display: "flex", justifyContent: "space-between", alignItems: "center" };

type GridCol = {
  key: string;
  label: string;
  type?: "text" | "number" | "float" | "bool" | "date";
  readOnly?: boolean;
  format?: (row: Record<string, unknown>) => string;
  gridRef?: string;
  phoneUrOb?: 0 | 1;
};

type GridRefSpec = {
  apiPath: string;
  idField: string;
  nullable?: boolean;
  display: (r: Record<string, unknown>) => string;
  modalTitle: string;
  primaryHeader: string;
  placeholder: string;
  quickCreateFromInput: (raw: string) => Record<string, unknown>;
};

type SectionDef = {
  apiPath: string;
  idField: string;
  title: string;
  sidebar: string;
  columns: GridCol[];
  toRequest: (row: Record<string, unknown>) => Record<string, unknown>;
  createDefault: () => Promise<Record<string, unknown>>;
};

export type GridRegistryAppProps = {
  sidebarTitle: string;
  colWidthsStorageKey: string;
  defaultSection: string;
  sectionOrder: string[];
  getSection: (id: string) => SectionDef;
  gridRefSpecs: Record<string, GridRefSpec>;
  cellValue: (
    row: Record<string, unknown>,
    col: GridCol,
    gridRefCache?: Record<string, Record<string, unknown>[]>
  ) => string;
  loadGridRefLists: () => Promise<Record<string, Record<string, unknown>[]>>;
  /** Дополнить строки после загрузки (например, виртуальные FK). */
  enrichLoadedRows?: (
    sectionId: string,
    rows: Record<string, unknown>[],
    gridRefLists: Record<string, Record<string, unknown>[]>
  ) => Record<string, unknown>[];
  /** Дополнить строку после PUT (когда API не возвращает все FK). */
  patchRowAfterSave?: (
    sectionId: string,
    prevRow: Record<string, unknown>,
    updated: Record<string, unknown>,
    gridRefLists: Record<string, Record<string, unknown>[]>
  ) => Record<string, unknown>;
  /** Связи вне FK строки (телефоны и т.п.). null — стандартное сохранение через PUT. */
  handleGridRefAction?: (
    action: "pick" | "clear",
    sectionId: string,
    col: GridCol,
    row: Record<string, unknown>,
    picked?: Record<string, unknown>
  ) => Promise<Record<string, unknown> | null>;
  /** Разделы с формой-карточкой (добавление и редактирование одним запросом). */
  cardSectionIds?: string[];
  /** Ссылки на экспорт отчётов внизу бокового меню. */
  sidebarReportLinks?: { href: string; label: string }[];
};

type UiState = { searchQuery: string; sortColumn: string | null; sortDirection: "asc" | "desc" };

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function pickFk(val: unknown, nestedIdField: string): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  return getNestedId(val, nestedIdField) ?? 0;
}

function IconPencil({ title }: { title?: string }) {
  return (
    <svg className="icon-pencil" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {title ? <title>{title}</title> : null}
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function loadColWidths(storageKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey);
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

function mergeGridRefFieldsFromPrev(
  prev: Record<string, unknown>,
  updated: Record<string, unknown>,
  columns: GridCol[]
): Record<string, unknown> {
  const merged = { ...updated };
  for (const col of columns) {
    if (!col.gridRef) continue;
    const fromApi = merged[col.key];
    const fromPrev = prev[col.key];
    const apiMissing =
      fromApi === null ||
      fromApi === undefined ||
      (typeof fromApi === "number" && fromApi === 0);
    if (fromPrev != null && fromPrev !== "" && apiMissing) {
      merged[col.key] = fromPrev;
    }
  }
  return merged;
}

function filterAndSortData(
  rows: Record<string, unknown>[],
  columns: string[],
  ui: UiState,
  cellValue: (row: Record<string, unknown>, col: string) => string,
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
      const cmp = isNum ? an - bn : av.toLowerCase().localeCompare(bv.toLowerCase());
      return ui.sortDirection === "asc" ? cmp : -cmp;
    });
  } else {
    filtered.sort((a, b) => {
      const an = Number(a[primaryIdField]);
      const bn = Number(b[primaryIdField]);
      const aOk = Number.isFinite(an);
      const bOk = Number.isFinite(bn);
      if (aOk && bOk) return bn - an;
      if (aOk) return -1;
      if (bOk) return 1;
      return 0;
    });
  }
  return filtered;
}

function gridInputDefault(row: Record<string, unknown>, col: GridCol, cellValue: GridRegistryAppProps["cellValue"]): string {
  if (col.gridRef || col.readOnly) return "";
  const v = row[col.key];
  if ((v === undefined || v === null) && (col.type === "number" || col.type === "float")) return "";
  if ((col.type === "number" || col.type === "float") && v !== null && v !== undefined && typeof v === "object")
    return String(pickFk(v, col.key));
  return cellValue(row, col, undefined);
}

function parseGridInput(raw: string, col: GridCol, row: Record<string, unknown>): unknown {
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
  if (col.type === "bool") return raw === "Да" || raw === "true" || raw === "1";
  if (col.type === "date") return raw.trim() === "" ? null : raw;
  return raw;
}

function resolveFkValue(
  col: GridCol,
  value: unknown,
  gridRefLists: Record<string, Record<string, unknown>[]>,
  gridRefSpecs: Record<string, GridRefSpec>
): unknown {
  if (!col.gridRef) return value;
  const spec = gridRefSpecs[col.gridRef];
  if (!spec) return value;
  const id = typeof value === "number" ? value : pickFk(value, spec.idField);
  if (id <= 0) return null;
  const found = gridRefLists[col.gridRef]?.find((r) => pickFk(r, spec.idField) === id);
  return found ?? value;
}

function bodyToDraftRow(
  columns: GridCol[],
  body: Record<string, unknown>,
  gridRefLists: Record<string, Record<string, unknown>[]>,
  gridRefSpecs: Record<string, GridRefSpec>
): Record<string, unknown> {
  const draft: Record<string, unknown> = { ...body };
  for (const col of columns) {
    if (Object.prototype.hasOwnProperty.call(body, col.key)) {
      draft[col.key] = resolveFkValue(col, body[col.key], gridRefLists, gridRefSpecs);
    }
  }
  return draft;
}

type GridCardState = {
  mode: "create" | "edit";
  rowIndex?: number;
  draft: Record<string, unknown>;
};

function GridReferenceModal(props: {
  spec: GridRefSpec;
  rows: Record<string, unknown>[];
  onClose: () => void;
  onPick: (picked: Record<string, unknown>) => void;
  onCreated: (created: Record<string, unknown>) => void;
  showToast: (msg: string) => void;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  const { spec } = props;
  const idKey = spec.idField;
  const [draft, setDraft] = useState("");

  const add = async () => {
    try {
      const created = await apiPost<Record<string, unknown>>(spec.apiPath, spec.quickCreateFromInput(draft));
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
      <div className="modal-content" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{spec.modalTitle}</span>
          <button type="button" className="clear-filters" style={{ background: "none", fontSize: "24px", padding: "0 8px" }} onClick={props.onClose} aria-label="Закрыть">×</button>
        </div>
        <div className="modal-body">
          {props.allowClear && props.onClear ? (
            <div style={{ marginBottom: 12 }}>
              <button type="button" className="btn-small" onClick={() => props.onClear?.()}>Сбросить связь</button>
            </div>
          ) : null}
          <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input className="cell-input-minimal" style={{ flex: 1, minWidth: 160 }} placeholder={spec.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />
            <button type="button" className="btn-small" onClick={() => void add()}>Добавить и выбрать</button>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="modal-table">
              <thead><tr><th>{spec.primaryHeader}</th></tr></thead>
              <tbody>
                {props.rows.length === 0 ? (
                  <tr><td style={{ color: "#71717a" }}>Нет данных</td></tr>
                ) : (
                  props.rows.map((item) => (
                    <tr key={str(item[idKey])} style={{ cursor: "pointer" }} onClick={() => props.onPick(item)}>
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

function GridRefCell(props: {
  col: GridCol;
  row: Record<string, unknown>;
  idx: number;
  width: number;
  spec: GridRefSpec;
  val: string;
  list: Record<string, unknown>[];
  editing: { kind: string; rowIndex: number; colKey: string; filter: string } | null;
  setEditing: (v: { kind: string; rowIndex: number; colKey: string; filter: string } | null) => void;
  openModal: () => void;
  onPick: (picked: Record<string, unknown>) => void;
  onClear: () => void;
}) {
  const { col, idx, spec, val, list, editing } = props;
  const gk = col.gridRef!;
  const isEditing = editing?.kind === gk && editing.rowIndex === idx && editing.colKey === col.key;
  const sug = list.filter((r) => spec.display(r).toLowerCase().includes((editing?.filter ?? "").toLowerCase()));
  const showAc = isEditing && editing!.filter.length > 0 && (spec.nullable || sug.length > 0);
  const startEdit = (filter: string) => props.setEditing({ kind: gk, rowIndex: idx, colKey: col.key, filter });
  const pencilBtn = (
    <button type="button" className="table-icon-btn" title="Открыть справочник" aria-label="Открыть справочник" onMouseDown={(e) => e.preventDefault()} onClick={props.openModal}>
      <IconPencil />
    </button>
  );

  return (
    <td className="reference-cell" style={{ width: props.width, minWidth: 64 }}>
      {isEditing ? (
        <div className="cell-editor" style={{ position: "relative" }}>
          <input className="autocomplete-input cell-input-minimal" autoFocus value={editing!.filter} placeholder="Введите или выберите..."
            onChange={(e) => startEdit(e.target.value)} onBlur={() => setTimeout(() => props.setEditing(null), 150)}
            onKeyDown={(e) => e.key === "Enter" && props.setEditing(null)} />
          {pencilBtn}
          {showAc && (
            <div className="autocomplete-list" style={AC_LIST_STYLE}>
              {spec.nullable ? (
                <div className="autocomplete-item autocomplete-item-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => props.onClear()}>— Не выбрано</div>
              ) : null}
              {sug.slice(0, 12).map((s) => (
                <div key={str(s[spec.idField])} className="autocomplete-item" onMouseDown={(e) => e.preventDefault()} onClick={() => props.onPick(s)}>
                  {spec.display(s)}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div role="button" tabIndex={0} style={FLEX_ROW} onClick={() => startEdit(val)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && startEdit(val)}>
          <span>{val || <span className="cell-placeholder">[выбрать]</span>}</span>
          <button type="button" className="cell-ref-action table-icon-btn" title="Открыть справочник" aria-label="Открыть справочник"
            onClick={(e) => { e.stopPropagation(); props.openModal(); }}>
            <IconPencil />
          </button>
        </div>
      )}
    </td>
  );
}

function GridValueCell(props: {
  col: GridCol;
  row: Record<string, unknown>;
  idx: number;
  width: number;
  idField: string;
  singleCol: boolean;
  cellValue: GridRegistryAppProps["cellValue"];
  onCommit: (next: Record<string, unknown>) => void;
}): ReactNode {
  const { col, row, width, idField, singleCol, cellValue, onCommit } = props;
  const td = (children: ReactNode) => <td style={{ width, minWidth: 64 }}>{children}</td>;
  if (col.readOnly || col.format) return td(col.format ? col.format(row) : cellValue(row, col));
  if (col.type === "bool") {
    const v = cellValue(row, col);
    return td(
      <select key={`${str(row[idField])}-${col.key}-${str(row[col.key])}`} className="filter-select cell-select-minimal" style={{ width: "100%" }} defaultValue={v}
        onChange={(e) => onCommit({ ...row, [col.key]: parseGridInput(e.target.value, col, row) })}>
        <option value="">—</option><option value="Да">Да</option><option value="Нет">Нет</option>
      </select>
    );
  }
  const defVal = gridInputDefault(row, col, cellValue);
  const commitBlur = (raw: string) => onCommit({ ...row, [col.key]: parseGridInput(raw, col, row) });
  if (singleCol) {
    return td(
      <textarea key={`${str(row[idField])}-${col.key}-${defVal}`} className="cell-textarea" defaultValue={defVal} rows={2}
        onBlur={(e) => commitBlur(e.target.value)} />
    );
  }
  const inputType = col.type === "number" ? "number" : col.type === "date" ? "date" : "text";
  return td(
    <input key={`${str(row[idField])}-${col.key}-${defVal}`} className="cell-input-minimal" defaultValue={defVal} type={inputType}
      onBlur={(e) => commitBlur(e.target.value)} />
  );
}

export function GridRegistryApp(props: GridRegistryAppProps) {
  const {
    getSection,
    cellValue,
    loadGridRefLists,
    gridRefSpecs,
    colWidthsStorageKey,
    enrichLoadedRows,
    patchRowAfterSave,
    handleGridRefAction,
    cardSectionIds,
  } = props;
  const cardSections = useMemo(() => new Set(cardSectionIds ?? []), [cardSectionIds]);
  const hasCardForm = cardSections.has.bind(cardSections);
  const [section, setSection] = useState(props.defaultSection);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ui, setUi] = useState<UiState>({ searchQuery: "", sortColumn: null, sortDirection: "asc" });
  const [colWidths, setColWidths] = useState(() => loadColWidths(colWidthsStorageKey));
  const [gridRefLists, setGridRefLists] = useState<Record<string, Record<string, unknown>[]>>({});
  const gridRefListsRef = useRef(gridRefLists);
  gridRefListsRef.current = gridRefLists;
  const [gridRefModal, setGridRefModal] = useState<{
    kind: string;
    rowIndex?: number;
    colKey: string;
    target: "table" | "card";
  } | null>(null);
  const [editingGridRef, setEditingGridRef] = useState<{ kind: string; rowIndex: number; colKey: string; filter: string } | null>(null);
  const [gridCard, setGridCard] = useState<GridCardState | null>(null);
  const [gridCardSubmitting, setGridCardSubmitting] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(colWidthsStorageKey, JSON.stringify(colWidths)); } catch { /* ignore */ }
  }, [colWidths, colWidthsStorageKey]);

  const sectionDef = useMemo(() => getSection(section), [getSection, section]);
  const { columns: gridColumns, idField } = sectionDef;
  const singleColSection = gridColumns.length === 1;

  const widthStorageKey = useCallback((colKey: string) => `${section}::${colKey}`, [section]);
  const getColWidth = useCallback((colKey: string) => colWidths[widthStorageKey(colKey)] ?? DEFAULT_COL_WIDTH, [colWidths, widthStorageKey]);
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;

  const beginColumnResize = useCallback((colKey: string, clientX: number) => {
    const wk = widthStorageKey(colKey);
    const startW = colWidthsRef.current[wk] ?? DEFAULT_COL_WIDTH;
    const startX = clientX;
    const onMove = (e: MouseEvent) => setColWidths((prev) => ({ ...prev, [wk]: Math.max(64, Math.min(800, Math.round(startW + e.clientX - startX))) }));
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
  }, [widthStorageKey]);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const refreshGridRefLists = useCallback(async () => {
    try { setGridRefLists(await loadGridRefLists()); } catch { /* ignore */ }
  }, [loadGridRefLists]);

  const mergeGridRefIntoCache = useCallback((kind: string, created: Record<string, unknown>) => {
    setGridRefLists((prev) => ({ ...prev, [kind]: [...(prev[kind] ?? []), created] }));
  }, []);

  const loadSection = useCallback(async (sid: string) => {
    const def = getSection(sid);
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Record<string, unknown>[]>(def.apiPath);
      let loaded = Array.isArray(data) ? data : [];
      if (enrichLoadedRows) {
        loaded = enrichLoadedRows(sid, loaded, gridRefListsRef.current);
      }
      setRows(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [getSection, enrichLoadedRows]);

  useEffect(() => { void loadSection(section); }, [section, loadSection]);
  useEffect(() => { void refreshGridRefLists(); }, [refreshGridRefLists]);
  useEffect(() => { setEditingGridRef(null); setGridRefModal(null); setGridCard(null); }, [section]);

  useEffect(() => {
    if (!enrichLoadedRows) return;
    setRows((prev) => {
      if (prev.length === 0) return prev;
      return enrichLoadedRows(section, prev, gridRefLists);
    });
  }, [gridRefLists, enrichLoadedRows]);

  const gridUsesGridRef = gridColumns.some((c) => c.gridRef);
  const displayRows = useMemo(() => {
    const keys = gridColumns.map((c) => c.key);
    const cache = gridUsesGridRef ? gridRefLists : undefined;
    return filterAndSortData(rows, keys, ui, (r, k) => {
      const col = gridColumns.find((c) => c.key === k);
      return col ? cellValue(r, col, cache) : "";
    }, idField);
  }, [rows, gridColumns, ui, cellValue, gridUsesGridRef, gridRefLists, idField]);

  const clearFilters = () => setUi({ searchQuery: "", sortColumn: null, sortDirection: "asc" });
  const switchSection = (s: string) => {
    setSection(s);
    setGridCard(null);
    clearFilters();
  };
  const resolveGridRowIndex = (filteredRow: Record<string, unknown>) =>
    rows.findIndex((r) => r[idField] === filteredRow[idField]);

  const saveGridRow = async (row: Record<string, unknown>, idx: number) => {
    const id = row[idField];
    if (typeof id !== "number" || id < 0) return;
    try {
      const updated = await apiPut<Record<string, unknown>>(`${sectionDef.apiPath}/${id}`, sectionDef.toRequest(row));
      let merged = mergeGridRefFieldsFromPrev(row, updated, sectionDef.columns);
      if (patchRowAfterSave) {
        merged = patchRowAfterSave(section, row, merged, gridRefLists);
      }
      setRows((prev) => {
        const next = [...prev];
        const origIdx = prev.findIndex((r) => r[idField] === id);
        next[origIdx >= 0 ? origIdx : idx] = merged;
        return next;
      });
      showToast("Сохранено");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const applyGridFkAndSave = async (rowIndex: number, colKey: string, picked: Record<string, unknown>) => {
    const row = rows[rowIndex];
    if (!row) return;
    const col = gridColumns.find((c) => c.key === colKey);
    setEditingGridRef(null);
    setGridRefModal(null);
    if (col && handleGridRefAction) {
      const custom = await handleGridRefAction("pick", section, col, row, picked);
      if (custom) {
        setRows((prev) => {
          const next = [...prev];
          const id = row[idField];
          const origIdx = prev.findIndex((r) => r[idField] === id);
          next[origIdx >= 0 ? origIdx : rowIndex] = custom;
          return next;
        });
        showToast("Сохранено");
        return;
      }
    }
    await saveGridRow({ ...row, [colKey]: picked }, rowIndex);
  };

  const applyGridFkClear = async (rowIndex: number, colKey: string) => {
    const row = rows[rowIndex];
    if (!row) return;
    const col = gridColumns.find((c) => c.key === colKey);
    setEditingGridRef(null);
    setGridRefModal(null);
    if (col && handleGridRefAction) {
      const custom = await handleGridRefAction("clear", section, col, row);
      if (custom) {
        setRows((prev) => {
          const next = [...prev];
          const id = row[idField];
          const origIdx = prev.findIndex((r) => r[idField] === id);
          next[origIdx >= 0 ? origIdx : rowIndex] = custom;
          return next;
        });
        showToast("Сохранено");
        return;
      }
    }
    await saveGridRow({ ...row, [colKey]: null }, rowIndex);
  };

  const deleteRow = async (row: Record<string, unknown>) => {
    const id = row[idField];
    if (typeof id !== "number" || !window.confirm("Удалить запись?")) return;
    try {
      await apiDelete(`${sectionDef.apiPath}/${id}`);
      showToast("Удалено");
      await loadSection(section);
      void refreshGridRefLists();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  const addGridRow = async () => {
    try {
      await apiPost(sectionDef.apiPath, await sectionDef.createDefault());
      showToast("Строка добавлена");
      await loadSection(section);
      void refreshGridRefLists();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const openGridCreateCard = async () => {
    try {
      const body = await sectionDef.createDefault();
      let draft = bodyToDraftRow(sectionDef.columns, body, gridRefLists, gridRefSpecs);
      if (enrichLoadedRows) {
        const [enriched] = enrichLoadedRows(section, [draft], gridRefLists);
        draft = enriched;
      }
      setGridCard({ mode: "create", draft });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const triggerAddRow = () => {
    if (hasCardForm(section)) void openGridCreateCard();
    else void addGridRow();
  };

  const openGridEditCard = (row: Record<string, unknown>, rowIndex: number) => {
    let draft = { ...row };
    if (enrichLoadedRows) {
      const [enriched] = enrichLoadedRows(section, [row], gridRefLists);
      draft = enriched;
    }
    setGridCard({ mode: "edit", rowIndex, draft });
  };

  const onGridCardDraftChange = (colKey: string, value: string, type?: GridCol["type"]) => {
    const col = gridColumns.find((c) => c.key === colKey);
    if (!col || col.readOnly || col.format || col.gridRef) return;
    setGridCard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        draft: { ...prev.draft, [colKey]: parseGridInput(value, col, prev.draft) },
      };
    });
  };

  const applyGridFkToCardDraft = (colKey: string, picked: Record<string, unknown> | null) => {
    setGridCard((prev) => {
      if (!prev) return prev;
      return { ...prev, draft: { ...prev.draft, [colKey]: picked } };
    });
    setEditingGridRef(null);
    setGridRefModal(null);
  };

  const applyCardGridRefPick = async (colKey: string, picked: Record<string, unknown>) => {
    const col = gridColumns.find((c) => c.key === colKey);
    if (!col) return;
    if (col.gridRef === "numberPhone" && handleGridRefAction) {
      if (!gridCard || gridCard.mode === "create") {
        showToast("Сначала сохраните запись кнопкой «Добавить»");
        setGridRefModal(null);
        return;
      }
      try {
        const custom = await handleGridRefAction("pick", section, col, gridCard.draft, picked);
        if (custom) setGridCard((prev) => (prev ? { ...prev, draft: custom } : prev));
        showToast("Сохранено");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
      }
      setGridRefModal(null);
      return;
    }
    applyGridFkToCardDraft(colKey, picked);
  };

  const applyCardGridRefClear = async (colKey: string) => {
    const col = gridColumns.find((c) => c.key === colKey);
    if (!col) return;
    if (col.gridRef === "numberPhone" && handleGridRefAction && gridCard) {
      if (gridCard.mode === "create") {
        showToast("Сначала сохраните запись");
        setGridRefModal(null);
        return;
      }
      try {
        const custom = await handleGridRefAction("clear", section, col, gridCard.draft);
        if (custom) setGridCard((prev) => (prev ? { ...prev, draft: custom } : prev));
        showToast("Сохранено");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ошибка");
      }
      setGridRefModal(null);
      return;
    }
    applyGridFkToCardDraft(colKey, null);
  };

  const submitGridCard = async () => {
    if (!gridCard || gridCardSubmitting) return;
    setGridCardSubmitting(true);
    try {
      if (gridCard.mode === "create") {
        const created = await apiPost<Record<string, unknown>>(
          sectionDef.apiPath,
          sectionDef.toRequest(gridCard.draft)
        );
        let merged = mergeGridRefFieldsFromPrev(gridCard.draft, created, sectionDef.columns);
        if (patchRowAfterSave) {
          merged = patchRowAfterSave(section, gridCard.draft, merged, gridRefLists);
        }
        showToast("Добавлено");
      } else {
        const id = gridCard.draft[idField];
        if (typeof id !== "number" || id < 0) throw new Error("Некорректный id записи");
        const updated = await apiPut<Record<string, unknown>>(
          `${sectionDef.apiPath}/${id}`,
          sectionDef.toRequest(gridCard.draft)
        );
        let merged = mergeGridRefFieldsFromPrev(gridCard.draft, updated, sectionDef.columns);
        if (patchRowAfterSave) {
          merged = patchRowAfterSave(section, gridCard.draft, merged, gridRefLists);
        }
        if (enrichLoadedRows) {
          const [enriched] = enrichLoadedRows(section, [merged], gridRefLists);
          merged = enriched;
        }
        setRows((prev) => {
          const next = [...prev];
          const origIdx =
            gridCard.rowIndex ?? prev.findIndex((r) => r[idField] === id);
          if (origIdx >= 0) next[origIdx] = merged;
          return next;
        });
        showToast("Сохранено");
        setGridCard(null);
        setGridCardSubmitting(false);
        return;
      }
      setGridCard(null);
      await loadSection(section);
      void refreshGridRefLists();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGridCardSubmitting(false);
    }
  };

  const openGridRefFromCard = (colKey: string) => {
    const col = gridColumns.find((c) => c.key === colKey);
    if (!col?.gridRef) return;
    setGridRefModal({ kind: col.gridRef, colKey, target: "card" });
  };

  const cardModalTitle = useMemo(() => {
    if (!gridCard) return "";
    if (gridCard.mode === "create") return `Новая запись — ${sectionDef.sidebar}`;
    const nameCol = gridColumns.find(
      (c) => c.key === "name_obj" || c.key === "name_trash" || c.key === "name_own"
    );
    if (nameCol) {
      const label = cellValue(gridCard.draft, nameCol, gridRefLists);
      if (label) return `${sectionDef.sidebar} — ${label}`;
    }
    return `Карточка — ${sectionDef.sidebar}`;
  }, [gridCard, sectionDef.sidebar, gridColumns, cellValue, gridRefLists]);

  const sortHeaderClick = (colKey: string) => {
    setUi((prev) => prev.sortColumn === colKey
      ? { ...prev, sortDirection: prev.sortDirection === "asc" ? "desc" : "asc" }
      : { ...prev, sortColumn: colKey, sortDirection: "asc" });
  };

  const modalSpec = gridRefModal ? gridRefSpecs[gridRefModal.kind] : null;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">{props.sidebarTitle}</div>
        <nav className="table-list">
          {props.sectionOrder.map((id) => (
            <button key={id} type="button" className={`table-item ${section === id ? "active" : ""}`} onClick={() => switchSection(id)}>
              {getSection(id).sidebar}
            </button>
          ))}
        </nav>
        {props.sidebarReportLinks && props.sidebarReportLinks.length > 0 ? (
          <div className="info-note" style={{ margin: "12px" }}>
            {props.sidebarReportLinks.map((link, i) => (
              <span key={link.href}>
                {i > 0 ? <br /> : null}
                <a className="toolbar-link" href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </span>
            ))}
          </div>
        ) : null}
      </aside>

      <main className="main-content">
        <h1 className="page-title">{sectionDef.title}</h1>
        {error && <div className="error-banner">{error}</div>}
        <div className="toolbar">
          <div className="search-box">
            <input type="search" placeholder="Поиск по всем полям таблицы..." value={ui.searchQuery}
              onChange={(e) => setUi((p) => ({ ...p, searchQuery: e.target.value }))} />
          </div>
          <button type="button" className="clear-filters" onClick={clearFilters}>Сбросить поиск и сортировку</button>
        </div>

        {loading ? <div className="loading">Загрузка...</div> : (
          <>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {gridColumns.map((col) => {
                      const ind = ui.sortColumn === col.key ? (ui.sortDirection === "asc" ? "▲" : "▼") : "⇅";
                      const w = getColWidth(col.key);
                      return (
                        <th key={col.key} style={{ width: w, minWidth: 64 }} onClick={() => sortHeaderClick(col.key)}>
                          <span className="th-label">{col.label} <span className="sort-icon">{ind}</span></span>
                          <span className="col-resize-handle" role="separator" aria-hidden title="Потяните, чтобы изменить ширину столбца"
                            onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); beginColumnResize(col.key, e.clientX); }} />
                        </th>
                      );
                    })}
                    <th className="col-actions" aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, rowIndex) => {
                    const idx = resolveGridRowIndex(row);
                    return (
                      <tr key={`grid-${section}-${rowIndex}-${str(row[idField])}`}>
                        {gridColumns.map((col) => {
                          const gcw = getColWidth(col.key);
                          if (col.gridRef) {
                            const gk = col.gridRef;
                            return (
                              <GridRefCell key={col.key} col={col} row={row} idx={idx} width={gcw} spec={gridRefSpecs[gk]} val={cellValue(row, col, gridRefLists)}
                                list={gridRefLists[gk] ?? []} editing={editingGridRef} setEditing={setEditingGridRef}
                                openModal={() =>
                                  setGridRefModal({
                                    kind: gk,
                                    rowIndex: idx,
                                    colKey: col.key,
                                    target: "table",
                                  })
                                }
                                onPick={(picked) => void applyGridFkAndSave(idx, col.key, picked)}
                                onClear={() => void applyGridFkClear(idx, col.key)} />
                            );
                          }
                          return (
                            <GridValueCell key={col.key} col={col} row={row} idx={idx} width={gcw} idField={idField}
                              singleCol={singleColSection && !col.gridRef && !col.readOnly && !col.format}
                              cellValue={cellValue} onCommit={(next) => void saveGridRow(next, idx)} />
                          );
                        })}
                        <td className="col-actions">
                          {hasCardForm(section) ? (
                            <button
                              type="button"
                              className="btn-small"
                              onClick={() => openGridEditCard(row, idx)}
                            >
                              Карточка
                            </button>
                          ) : null}
                          <button type="button" className="btn-small" onClick={() => void deleteRow(row)}>
                            Удалить
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {displayRows.length === 0 && (
                    <tr><td colSpan={gridColumns.length + 1} style={{ textAlign: "center", padding: 40 }}>Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="info-note">
              Показано {displayRows.length} из {rows.length} записей. Горизонтальная прокрутка — для широких таблиц.
            </div>
          </>
        )}
        <button type="button" className="floating-add-btn" onClick={triggerAddRow}>
          {hasCardForm(section) ? "Добавить" : "Добавить строку"}
        </button>
      </main>

      {gridRefModal && modalSpec && (
        <GridReferenceModal
          spec={modalSpec}
          rows={gridRefLists[gridRefModal.kind] ?? []}
          onClose={() => setGridRefModal(null)}
          onPick={(picked) => {
            if (gridRefModal.target === "card") {
              void applyCardGridRefPick(gridRefModal.colKey, picked);
            } else if (gridRefModal.rowIndex !== undefined) {
              void applyGridFkAndSave(gridRefModal.rowIndex, gridRefModal.colKey, picked);
            }
          }}
          onCreated={(created) => mergeGridRefIntoCache(gridRefModal.kind, created)}
          showToast={showToast}
          allowClear={modalSpec.nullable === true}
          onClear={() => {
            if (gridRefModal.target === "card") {
              void applyCardGridRefClear(gridRefModal.colKey);
            } else if (gridRefModal.rowIndex !== undefined) {
              void applyGridFkClear(gridRefModal.rowIndex, gridRefModal.colKey);
            }
          }}
        />
      )}

      {gridCard && (
        <GridCardModal
          mode={gridCard.mode}
          title={cardModalTitle}
          draft={gridCard.draft}
          columns={gridColumns}
          getCellValue={(row, col) => cellValue(row, col, gridRefLists)}
          onClose={() => setGridCard(null)}
          onDraftChange={onGridCardDraftChange}
          onOpenGridRef={openGridRefFromCard}
          onSubmit={() => void submitGridCard()}
          submitting={gridCardSubmitting}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
