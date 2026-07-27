/** Паспорт объекта РХЗО — UI по аналогии с паспортом предприятия РОО (RoioFactoryHub). */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiDelete, apiGet, apiPost, apiPut, formatCity, formatDegree, formatGroupPlace, formatRegion, formatStorage, getNestedId, objectPlaceTrashToRequest } from "./api";
import { DateField, formatDateRu } from "./DateField";
import { ExcludeFilterControl } from "./ExcludeFilterControl";
import "./RoioFactoryHub.css";

type Mode = "view" | "edit" | "create";

type PagePayload<T> = {
  content: T[];
  totalElements: number;
};

type ComboOption = { id: string; label: string; raw: Record<string, unknown> };

type HubPhone = {
  _key: string;
  id_phone_number?: number;
  number: string;
  ur_ob: 0 | 1 | null;
};

type HubWaste = {
  _key: string;
  id_characteristic_trash?: number;
  id_magazin_trash: unknown;
  id_state: unknown;
  weight_for_year: number;
  square_for_year: number;
};

type HubNamed = {
  _key: string;
  id?: number;
  name: string;
};

type HubBundle = {
  object: Record<string, unknown>;
  phones: HubPhone[];
  wastes: HubWaste[];
  around: HubNamed[];
  natural: HubNamed[];
};

type Baseline = {
  phoneIds: number[];
  wasteIds: number[];
  aroundIds: number[];
  naturalIds: number[];
};

type RefLists = {
  region: Record<string, unknown>[];
  cities: Record<string, unknown>[];
  group: Record<string, unknown>[];
  storage: Record<string, unknown>[];
  degree: Record<string, unknown>[];
  magazin: Record<string, unknown>[];
  physicalState: Record<string, unknown>[];
};

const LIST_COLS: { key: string; label: string }[] = [
  { key: "id_registration", label: "Рег. номер" },
  { key: "date_register", label: "Дата регистрации" },
  { key: "name_obj", label: "Наименование объекта" },
  { key: "name_own", label: "Наименование собственника" },
  { key: "payer_indentification_number", label: "УНП" },
];

const OBJECT_FIELDS: {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "float" | "bool" | "textarea" | "ref";
  ref?: keyof RefLists;
  required?: boolean;
  row?: string;
}[] = [
  { key: "id_registration", label: "Код регистрации", required: true },
  { key: "register", label: "Реестровый номер", type: "number", required: true, row: "meta" },
  { key: "date_register", label: "Дата регистрации", type: "date", row: "meta" },
  { key: "payer_indentification_number", label: "УНП", row: "meta" },
  { key: "name_obj", label: "Наименование объекта", type: "textarea", required: true },
  { key: "name_own", label: "Наименование собственника", type: "textarea", required: true },
  { key: "company_located", label: "Юридический адрес собственника", type: "textarea" },
  { key: "place_obj", label: "Местонахождение объекта", type: "textarea" },
  { key: "id_region", label: "Область", type: "ref", ref: "region" },
  { key: "id_cities", label: "Район / город", type: "ref", ref: "cities" },
  { key: "id_group_place_save", label: "Наименование группы", type: "ref", ref: "group" },
  { key: "id_storage_scheme", label: "Схема складирования", type: "ref", ref: "storage" },
  { key: "id_gruops_degree", label: "Группы", type: "ref", ref: "degree" },
  { key: "start_use", label: "Начало эксплуатации", type: "number" },
  { key: "servise_life", label: "Проектный срок эксплуатации", type: "textarea" },
  { key: "project", label: "Проект", type: "textarea" },
  { key: "state_expertize", label: "Заключение гос. экоэкспертизы", type: "bool", row: "flags" },
  { key: "confirmation_use", label: "Подтверждение ввода в эксплуатацию", type: "bool", row: "flags" },
  { key: "eco_pasport", label: "Экологический паспорт", type: "textarea" },
  { key: "prava_place", label: "Основание прав на участок", type: "textarea" },
  { key: "square", label: "Общая площадь, га", type: "float", row: "area" },
  { key: "use_square", label: "Для размещения, га", type: "float", row: "area" },
  { key: "trash_square", label: "Занятая отходами, га", type: "float", row: "area" },
  { key: "project_power", label: "Мощность объекта, тыс т/год", type: "textarea" },
  { key: "facticheskay_power", label: "Фактическая мощность", type: "textarea" },
  { key: "accomulated_trash", label: "Количество накопленных отходов", type: "textarea" },
  { key: "type_grounds", label: "Состав грунтов", type: "textarea" },
  { key: "ander_water", label: "Уровень подземных вод, м", type: "textarea" },
  { key: "observation_hole", label: "Наблюдательная скважина", type: "textarea" },
  { key: "status", label: "Исключен", type: "bool", row: "excl" },
  { key: "date_axclute", label: "Дата исключения", type: "date", row: "excl" },
  { key: "reson_axclute", label: "Основание исключения", type: "textarea" },
];

let _tmp = -1;
function nextTempId() {
  return _tmp--;
}
function newRowKey() {
  return `k${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function fmtDate(v: unknown): string {
  return formatDateRu(v) || (v === null || v === undefined || v === "" ? "" : String(v));
}

function HubCombo(props: {
  valueLabel: string;
  options: ComboOption[];
  disabled?: boolean;
  placeholder?: string;
  onPick: (opt: ComboOption | null) => void;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [text, setText] = useState(props.valueLabel);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    setText(props.valueLabel);
  }, [props.valueLabel]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const update = () => {
      const r = wrapRef.current!.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const listH = Math.min(200, spaceBelow > 120 ? spaceBelow - 8 : 160);
      const top = spaceBelow < 120 && r.top > listH ? r.top - listH - 2 : r.bottom + 2;
      setPos({ top, left: r.left, width: Math.max(r.width, 180) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return props.options.slice(0, 40);
    return props.options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 40);
  }, [props.options, text]);

  if (props.disabled) {
    return <input className="hub-input" disabled value={props.valueLabel || "—"} readOnly />;
  }

  const dropdown =
    open &&
    createPortal(
      <ul
        id={listId}
        ref={listRef}
        className="hub-combo-list hub-combo-list--portal"
        role="listbox"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
      >
        {filtered.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className="hub-combo-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                props.onPick(o);
                setText(o.label);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          </li>
        ))}
        {filtered.length === 0 ? <li className="hub-combo-empty">Нет совпадений</li> : null}
      </ul>,
      document.body
    );

  return (
    <div className="hub-combo" ref={wrapRef}>
      <input
        className="hub-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        placeholder={props.placeholder ?? "Выберите…"}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) props.onPick(null);
        }}
      />
      {dropdown}
    </div>
  );
}

function IconView() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IconToastOk() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#22c55e" />
      <path d="M7.2 12.3l3.1 3.1 6.5-6.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconToastErr() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#ef4444" />
      <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function NestedTable(props: {
  title: string;
  columns: string[];
  readOnly: boolean;
  variant?: "phones" | "tech" | "drop" | "trash";
  onAdd?: () => void;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <section className={`hub-nested hub-nested--${props.variant ?? "tech"}`}>
      <div className="hub-nested-head">
        <h3>{props.title}</h3>
        {!props.readOnly && props.onAdd ? (
          <button type="button" className="hub-btn-add" onClick={props.onAdd}>
            + Добавить
          </button>
        ) : null}
      </div>
      <div className="hub-nested-table-wrap">
        <table className="hub-nested-table">
          <thead>
            <tr>
              {!props.readOnly ? <th>Действия</th> : null}
              {props.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.empty ? (
              <tr>
                <td colSpan={props.columns.length + (props.readOnly ? 0 : 1)} className="hub-empty">
                  Нет данных
                </td>
              </tr>
            ) : (
              props.children
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function emptyObject(): Record<string, unknown> {
  return {
    id_object_place_trash: nextTempId(),
    id_registration: "",
    register: 0,
    date_register: "",
    name_obj: "",
    name_own: "",
    status: false,
    state_expertize: false,
    confirmation_use: false,
  };
}

function baselineFromBundle(b: HubBundle): Baseline {
  return {
    phoneIds: b.phones.map((p) => p.id_phone_number).filter((x): x is number => typeof x === "number" && x > 0),
    wasteIds: b.wastes
      .map((w) => w.id_characteristic_trash)
      .filter((x): x is number => typeof x === "number" && x > 0),
    aroundIds: b.around.map((a) => a.id).filter((x): x is number => typeof x === "number" && x > 0),
    naturalIds: b.natural.map((a) => a.id).filter((x): x is number => typeof x === "number" && x > 0),
  };
}

function comboLabel(val: unknown, idField: string, labelFn: (r: Record<string, unknown>) => string) {
  if (val && typeof val === "object") {
    const o = val as Record<string, unknown>;
    return labelFn(o) || str(o[idField]);
  }
  return "";
}

async function loadBundle(
  objectId: number,
  fallbackRow?: Record<string, unknown>
): Promise<HubBundle> {
  const [detail, chars, around, natural] = await Promise.all([
    apiGet<Record<string, unknown>>(`/api/object-place-trash/${objectId}`).catch(() => fallbackRow ?? null),
    apiGet<Record<string, unknown>[]>(`/api/object-place-trash/${objectId}/characteristic-trash`).catch(
      () => []
    ),
    apiGet<Record<string, unknown>[]>(`/api/object-place-trash/${objectId}/around-builds`).catch(() => []),
    apiGet<Record<string, unknown>[]>(`/api/object-place-trash/${objectId}/natual-save-buildings`).catch(
      () => []
    ),
  ]);

  const phonesRaw = Array.isArray(detail?.phones) ? (detail!.phones as Record<string, unknown>[]) : [];
  const phones: HubPhone[] = phonesRaw.map((p, i) => ({
    _key: newRowKey() + i,
    id_phone_number: typeof p.id_phone_number === "number" ? p.id_phone_number : undefined,
    number: str(p.number),
    ur_ob: p.ur_ob === 1 || p.ur_ob === "1" ? 1 : p.ur_ob === 0 || p.ur_ob === "0" ? 0 : null,
  }));

  const wastes: HubWaste[] = (Array.isArray(chars) ? chars : []).map((c) => ({
    _key: newRowKey(),
    id_characteristic_trash:
      typeof c.id_characteristic_trash === "number" ? c.id_characteristic_trash : undefined,
    id_magazin_trash: c.id_magazin_trash ?? null,
    id_state: c.id_state ?? null,
    weight_for_year: Number(c.weight_for_year ?? 0),
    square_for_year: Number(c.square_for_year ?? 0),
  }));

  const aroundList: HubNamed[] = (Array.isArray(around) ? around : []).map((r) => ({
    _key: newRowKey(),
    id: typeof r.id_around_build === "number" ? r.id_around_build : undefined,
    name: str(r.name),
  }));

  const naturalList: HubNamed[] = (Array.isArray(natural) ? natural : []).map((r) => ({
    _key: newRowKey(),
    id: typeof r.id_natual_save_build === "number" ? r.id_natual_save_build : undefined,
    name: str(r.name),
  }));

  return {
    object: detail ?? fallbackRow ?? {},
    phones,
    wastes,
    around: aroundList,
    natural: naturalList,
  };
}

async function saveBundle(mode: "create" | "edit", bundle: HubBundle, baseline: Baseline): Promise<void> {
  const body = objectPlaceTrashToRequest(bundle.object);
  let objectId =
    typeof bundle.object.id_object_place_trash === "number" && bundle.object.id_object_place_trash > 0
      ? bundle.object.id_object_place_trash
      : 0;

  if (mode === "create" || objectId <= 0) {
    const created = await apiPost<Record<string, unknown>>("/api/object-place-trash", body);
    objectId = Number(created.id_object_place_trash);
    if (!Number.isFinite(objectId) || objectId <= 0) throw new Error("Не удалось создать объект");
  } else {
    await apiPut(`/api/object-place-trash/${objectId}`, body);
  }

  const keepPhones = new Set<number>();
  for (const p of bundle.phones) {
    if (!p.number.trim()) continue;
    const ur = p.ur_ob === 1 ? 1 : 0;
    const phoneBody = { idObjectPlaceTrash: objectId, number: p.number.trim(), ur_ob: ur };
    if (p.id_phone_number && p.id_phone_number > 0) {
      await apiPut(`/api/number-phone/${p.id_phone_number}`, phoneBody);
      keepPhones.add(p.id_phone_number);
    } else {
      const created = await apiPost<Record<string, unknown>>("/api/number-phone", phoneBody);
      const id = Number(created.id_phone_number);
      if (Number.isFinite(id) && id > 0) keepPhones.add(id);
    }
  }
  for (const id of baseline.phoneIds) {
    if (!keepPhones.has(id)) {
      await apiDelete(`/api/object-place-trash/${objectId}/number-phone/${id}`);
    }
  }

  let defaultStateId: number | null = null;
  const ensureState = async () => {
    if (defaultStateId != null) return defaultStateId;
    const states = await apiGet<Record<string, unknown>[]>("/api/physical-state");
    const first = states?.[0];
    const sid =
      typeof first?.id_state === "number"
        ? first.id_state
        : typeof first?.idState === "number"
          ? first.idState
          : null;
    if (sid == null) throw new Error("Нет записей в справочнике PhysicalState");
    defaultStateId = sid;
    return sid;
  };

  const keepWastes = new Set<number>();
  for (const w of bundle.wastes) {
    const magazinId = getNestedId(w.id_magazin_trash, "id_magazin_trash");
    if (!magazinId) continue;
    const stateId = getNestedId(w.id_state, "id_state") ?? (await ensureState());
    const wasteBody = {
      idObjectPlaceTrash: objectId,
      idMagazinTrash: magazinId,
      idState: stateId,
      weightForYear: Number(w.weight_for_year ?? 0),
      squareForYear: Number(w.square_for_year ?? 0),
    };
    if (w.id_characteristic_trash && w.id_characteristic_trash > 0) {
      await apiPut(`/api/characteristic-trash/${w.id_characteristic_trash}`, wasteBody);
      keepWastes.add(w.id_characteristic_trash);
    } else {
      const created = await apiPost<Record<string, unknown>>("/api/characteristic-trash", wasteBody);
      const id = Number(created.id_characteristic_trash);
      if (Number.isFinite(id) && id > 0) keepWastes.add(id);
    }
  }
  for (const id of baseline.wasteIds) {
    if (!keepWastes.has(id)) await apiDelete(`/api/characteristic-trash/${id}`);
  }

  const keepAround = new Set<number>();
  for (const a of bundle.around) {
    if (!a.name.trim() && !(a.id && a.id > 0)) continue;
    if (a.id && a.id > 0 && baseline.aroundIds.includes(a.id)) {
      keepAround.add(a.id);
      continue;
    }
    const created = await apiPost<Record<string, unknown>>(
      `/api/object-place-trash/${objectId}/around-builds`,
      a.id && a.id > 0 ? { aroundBuildId: a.id } : { name: a.name.trim() }
    );
    const id = Number(created.id_around_build);
    if (Number.isFinite(id) && id > 0) keepAround.add(id);
  }
  for (const id of baseline.aroundIds) {
    if (!keepAround.has(id)) await apiDelete(`/api/object-place-trash/${objectId}/around-builds/${id}`);
  }

  const keepNatural = new Set<number>();
  for (const a of bundle.natural) {
    if (!a.name.trim() && !(a.id && a.id > 0)) continue;
    if (a.id && a.id > 0 && baseline.naturalIds.includes(a.id)) {
      keepNatural.add(a.id);
      continue;
    }
    const created = await apiPost<Record<string, unknown>>(
      `/api/object-place-trash/${objectId}/natual-save-buildings`,
      a.id && a.id > 0 ? { natualSaveBuildId: a.id } : { name: a.name.trim() }
    );
    const id = Number(created.id_natual_save_build);
    if (Number.isFinite(id) && id > 0) keepNatural.add(id);
  }
  for (const id of baseline.naturalIds) {
    if (!keepNatural.has(id)) {
      await apiDelete(`/api/object-place-trash/${objectId}/natual-save-buildings/${id}`);
    }
  }
}

export function RhzoObjectHub() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>("id_registration");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  /** По умолчанию исключённые (status=true) скрыты. */
  const [showExcluded, setShowExcluded] = useState(false);
  const [form, setForm] = useState<{ mode: Mode; bundle: HubBundle; baseline: Baseline } | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refs, setRefs] = useState<RefLists>({
    region: [],
    cities: [],
    group: [],
    storage: [],
    degree: [],
    magazin: [],
    physicalState: [],
  });

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };
  const dismissToast = () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sortColumn, sortDir, pageSize, showExcluded]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(Math.max(0, page - 1)),
        size: String(pageSize),
      });
      if (debouncedQ) params.set("q", debouncedQ);
      if (sortColumn) {
        params.set("sort", sortColumn);
        params.set("dir", sortDir);
      }
      if (showExcluded) params.set("includeExcluded", "true");
      const data = await apiGet<PagePayload<Record<string, unknown>> | Record<string, unknown>[]>(
        `/api/object-place-trash?${params}`
      );
      if (Array.isArray(data)) {
        setRows(data);
        setTotalElements(data.length);
      } else {
        const content = Array.isArray(data.content) ? data.content : [];
        setRows(content);
        setTotalElements(typeof data.totalElements === "number" ? data.totalElements : content.length);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setRows([]);
      setTotalElements(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, sortColumn, sortDir, showExcluded]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void (async () => {
      const paths: [keyof RefLists, string][] = [
        ["region", "/api/region"],
        ["cities", "/api/cities"],
        ["group", "/api/group-place-save"],
        ["storage", "/api/storage-scheme"],
        ["degree", "/api/gruops-degree"],
        ["magazin", "/api/magazin-trash"],
        ["physicalState", "/api/physical-state"],
      ];
      const next: RefLists = {
        region: [],
        cities: [],
        group: [],
        storage: [],
        degree: [],
        magazin: [],
        physicalState: [],
      };
      await Promise.all(
        paths.map(async ([k, path]) => {
          try {
            const list = await apiGet<Record<string, unknown>[]>(path);
            next[k] = Array.isArray(list) ? list : [];
          } catch {
            next[k] = [];
          }
        })
      );
      setRefs(next);
    })();
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize) || 1);
  const safePage = Math.min(page, totalPages);

  const sortHeaderClick = (key: string) => {
    if (sortColumn === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortColumn(key);
      setSortDir("asc");
    }
  };

  const openCreate = () => {
    const bundle: HubBundle = {
      object: emptyObject(),
      phones: [],
      wastes: [],
      around: [],
      natural: [],
    };
    setForm({ mode: "create", bundle, baseline: baselineFromBundle(bundle) });
  };

  const openExisting = async (row: Record<string, unknown>, mode: "view" | "edit") => {
    const id = row.id_object_place_trash;
    if (typeof id !== "number" || id <= 0) return;
    setFormBusy(true);
    try {
      const bundle = await loadBundle(id, row);
      setForm({ mode, bundle, baseline: baselineFromBundle(bundle) });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка загрузки паспорта", "err");
    } finally {
      setFormBusy(false);
    }
  };

  const deleteRow = async (row: Record<string, unknown>) => {
    const id = row.id_object_place_trash;
    if (typeof id !== "number" || id <= 0) return;
    if (!window.confirm("Удалить объект и связанные записи?")) return;
    setLoading(true);
    try {
      await apiDelete(`/api/object-place-trash/${id}`);
      showToast("Удалено");
      void loadList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка удаления", "err");
      setLoading(false);
    }
  };

  const saveForm = async () => {
    if (!form || form.mode === "view" || saving) return;
    const o = form.bundle.object;
    if (!str(o.id_registration).trim() || !str(o.name_obj).trim() || !str(o.name_own).trim()) {
      showToast("Заполните код регистрации, наименование объекта и собственника", "err");
      return;
    }
    setSaving(true);
    try {
      await saveBundle(form.mode === "create" ? "create" : "edit", form.bundle, form.baseline);
      showToast("Изменения сохранены");
      setForm(null);
      void loadList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка сохранения", "err");
    } finally {
      setSaving(false);
    }
  };

  const readOnly = form?.mode === "view";

  const updateObjectField = (key: string, value: unknown) => {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, bundle: { ...prev.bundle, object: { ...prev.bundle.object, [key]: value } } };
    });
  };

  const refOptions = (
    kind: keyof RefLists,
    idField: string,
    labelFn: (r: Record<string, unknown>) => string
  ): ComboOption[] =>
    refs[kind].map((r) => ({
      id: String(r[idField] ?? ""),
      label: labelFn(r) || str(r[idField]),
      raw: r,
    }));

  const magazinLabel = (r: Record<string, unknown>) => {
    const code = str(r.code_trash);
    const name = str(r.name_trash);
    return code && name ? `${code} — ${name}` : code || name;
  };

  return (
    <div className="hub-root">
      {toast ? (
        <div className={`hub-toast hub-toast--${toast.kind}`} role="status">
          <span className="hub-toast-icon" aria-hidden>
            {toast.kind === "ok" ? <IconToastOk /> : <IconToastErr />}
          </span>
          <span className="hub-toast-msg">{toast.msg}</span>
          <button type="button" className="hub-toast-close" title="Закрыть" onClick={dismissToast}>
            <IconClose />
          </button>
        </div>
      ) : null}

      <div className="hub-list-toolbar">
        <h1 className="hub-title">Паспорт объекта</h1>
        <div className="hub-list-toolbar-actions">
          <a
            className="hub-btn-add hub-btn-export"
            href="/api/reports/waste/detailed/export/pdf"
            target="_blank"
            rel="noreferrer"
          >
            Экспорт отчёта PDF
          </a>
          <button type="button" className="hub-btn-add hub-btn-create" onClick={openCreate}>
            + Создать
          </button>
        </div>
      </div>

      <div className="hub-toolbar">
        <div className="hub-search-wrap">
          <input
            type="search"
            className="hub-search"
            placeholder="Поиск по полям списка…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ExcludeFilterControl showExcluded={showExcluded} onChange={setShowExcluded} />
        </div>
        <button
          type="button"
          className="hub-link-btn"
          onClick={() => {
            setSearch("");
            setSortColumn("id_registration");
            setSortDir("asc");
            setShowExcluded(false);
          }}
        >
          Сбросить
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {loading || formBusy ? <div className="loading">Загрузка…</div> : null}

      <div className="hub-panel">
        <div className="hub-table-wrap">
          <table className="hub-list-table">
            <thead>
              <tr>
                <th className="hub-actions-col">Действия</th>
                {LIST_COLS.map((c) => {
                  const active = sortColumn === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => sortHeaderClick(c.key)}
                      style={{ cursor: "pointer" }}
                      className={active ? "hub-th-sorted" : undefined}
                    >
                      {c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="hub-empty">
                    Нет данных
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const id = row.id_object_place_trash;
                  return (
                    <tr key={String(id)}>
                      <td className="hub-actions-col">
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-view"
                          title="Просмотр"
                          onClick={() => void openExisting(row, "view")}
                        >
                          <IconView />
                        </button>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-edit"
                          title="Изменить"
                          onClick={() => void openExisting(row, "edit")}
                        >
                          <IconEdit />
                        </button>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          title="Удалить"
                          onClick={() => void deleteRow(row)}
                        >
                          <IconTrash />
                        </button>
                      </td>
                      {LIST_COLS.map((c) => (
                        <td key={c.key}>
                          {c.key === "date_register" ? fmtDate(row[c.key]) || "—" : str(row[c.key]) || "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="hub-pager">
          <span className="hub-pager-info">
            Стр. {safePage} из {totalPages} · всего {Math.max(0, totalElements)}
          </span>
          <label className="hub-pager-size">
            На странице
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="hub-pager-nav">
            <button type="button" className="hub-page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>
              «
            </button>
            <button
              type="button"
              className="hub-page-btn"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="hub-page-btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </button>
            <button
              type="button"
              className="hub-page-btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              »
            </button>
          </div>
        </div>
      </div>

      {form ? (
        <div className="hub-form-overlay" role="dialog" aria-modal="true">
          <div className="hub-form-shell">
            <header className="hub-form-header">
              <h2>
                {form.mode === "create"
                  ? "Создать паспорт объекта"
                  : form.mode === "view"
                    ? "Просмотр паспорта объекта"
                    : "Редактировать паспорт объекта"}
              </h2>
              <button
                type="button"
                className="hub-form-close"
                onClick={() => setForm(null)}
                title="Закрыть"
                aria-label="Закрыть"
              >
                <IconClose />
              </button>
            </header>

            <div className="hub-form-body">
              <section className="hub-form-block hub-form-block--main">
                <h3 className="hub-form-block-title">Основные сведения</h3>
                <div className="hub-form-grid">
                  {OBJECT_FIELDS.map((f) => {
                    const val = form.bundle.object[f.key];
                    const label = (
                      <label className="hub-field-label">
                        {f.label}
                        {f.required ? <span className="hub-req">*</span> : null}
                      </label>
                    );

                    if (f.type === "bool") {
                      return (
                        <div key={f.key} className={`hub-field${f.row ? ` hub-row-${f.row}` : ""}`}>
                          {label}
                          <div className="hub-radios">
                            <label className="hub-radio">
                              <input
                                type="radio"
                                disabled={readOnly}
                                checked={val === true}
                                onChange={() => updateObjectField(f.key, true)}
                              />
                              <span>да</span>
                            </label>
                            <label className="hub-radio">
                              <input
                                type="radio"
                                disabled={readOnly}
                                checked={val !== true}
                                onChange={() => updateObjectField(f.key, false)}
                              />
                              <span>нет</span>
                            </label>
                          </div>
                        </div>
                      );
                    }

                    if (f.type === "ref" && f.ref) {
                      const idField =
                        f.ref === "region"
                          ? "id_region"
                          : f.ref === "cities"
                            ? "id_cities"
                            : f.ref === "group"
                              ? "id_group_place_save"
                              : f.ref === "storage"
                                ? "id_storage_scheme"
                                : f.ref === "degree"
                                  ? "id_gruops_degree"
                                  : "id";
                      const labelFn =
                        f.ref === "region"
                          ? (r: Record<string, unknown>) => formatRegion(r)
                          : f.ref === "cities"
                            ? (r: Record<string, unknown>) => formatCity(r) || str(r.name_cities)
                            : f.ref === "group"
                              ? (r: Record<string, unknown>) => formatGroupPlace(r)
                              : f.ref === "storage"
                                ? (r: Record<string, unknown>) => formatStorage(r)
                                : (r: Record<string, unknown>) => formatDegree(r);
                      const opts = refOptions(f.ref, idField, labelFn);
                      return (
                        <div key={f.key} className="hub-field">
                          {label}
                          <HubCombo
                            disabled={readOnly}
                            valueLabel={comboLabel(val, idField, labelFn)}
                            options={opts}
                            onPick={(opt) => updateObjectField(f.key, opt?.raw ?? null)}
                          />
                        </div>
                      );
                    }

                    if (f.type === "textarea") {
                      return (
                        <div key={f.key} className="hub-field hub-field-full">
                          {label}
                          <textarea
                            className="hub-input hub-textarea"
                            disabled={readOnly}
                            rows={2}
                            value={str(val)}
                            onChange={(e) => updateObjectField(f.key, e.target.value)}
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={f.key} className={`hub-field${f.row ? ` hub-row-${f.row}` : ""}`}>
                        {label}
                        {f.type === "date" ? (
                          <DateField
                            disabled={readOnly}
                            value={val}
                            onChange={(iso) => updateObjectField(f.key, iso)}
                          />
                        ) : (
                          <input
                            className="hub-input"
                            type={f.type === "number" || f.type === "float" ? "number" : "text"}
                            step={f.type === "float" ? "any" : undefined}
                            disabled={readOnly}
                            value={str(val)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (f.type === "number") updateObjectField(f.key, raw === "" ? 0 : Number(raw));
                              else if (f.type === "float")
                                updateObjectField(f.key, raw === "" ? 0 : Number(raw));
                              else updateObjectField(f.key, raw);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <NestedTable
                title="Телефоны"
                variant="phones"
                columns={["Номер", "Тип"]}
                readOnly={!!readOnly}
                empty={form.bundle.phones.length === 0}
                onAdd={() =>
                  setForm((p) =>
                    p
                      ? {
                          ...p,
                          bundle: {
                            ...p.bundle,
                            phones: [...p.bundle.phones, { _key: newRowKey(), number: "", ur_ob: 0 }],
                          },
                        }
                      : p
                  )
                }
              >
                {form.bundle.phones.map((ph, i) => (
                  <tr key={ph._key}>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          title="Удалить"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    bundle: {
                                      ...p.bundle,
                                      phones: p.bundle.phones.filter((_, j) => j !== i),
                                    },
                                  }
                                : p
                            )
                          }
                        >
                          <IconTrash />
                        </button>
                      </td>
                    ) : null}
                    <td>
                      <input
                        className="hub-input"
                        disabled={readOnly}
                        value={ph.number}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((p) => {
                            if (!p) return p;
                            const phones = [...p.bundle.phones];
                            phones[i] = { ...phones[i], number: v };
                            return { ...p, bundle: { ...p.bundle, phones } };
                          });
                        }}
                      />
                    </td>
                    <td>
                      <select
                        className="hub-input"
                        disabled={readOnly}
                        value={ph.ur_ob === 1 ? "1" : "0"}
                        onChange={(e) => {
                          const ur = e.target.value === "1" ? 1 : 0;
                          setForm((p) => {
                            if (!p) return p;
                            const phones = [...p.bundle.phones];
                            phones[i] = { ...phones[i], ur_ob: ur };
                            return { ...p, bundle: { ...p.bundle, phones } };
                          });
                        }}
                      >
                        <option value="0">Юр. лицо</option>
                        <option value="1">Объект</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </NestedTable>

              <NestedTable
                title="Отходы объекта"
                variant="trash"
                columns={["Отход", "Физ. состояние", "Масса т/год", "Площадь"]}
                readOnly={!!readOnly}
                empty={form.bundle.wastes.length === 0}
                onAdd={() =>
                  setForm((p) =>
                    p
                      ? {
                          ...p,
                          bundle: {
                            ...p.bundle,
                            wastes: [
                              ...p.bundle.wastes,
                              {
                                _key: newRowKey(),
                                id_magazin_trash: null,
                                id_state: refs.physicalState[0] ?? null,
                                weight_for_year: 0,
                                square_for_year: 0,
                              },
                            ],
                          },
                        }
                      : p
                  )
                }
              >
                {form.bundle.wastes.map((w, i) => (
                  <tr key={w._key}>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          title="Удалить"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    bundle: {
                                      ...p.bundle,
                                      wastes: p.bundle.wastes.filter((_, j) => j !== i),
                                    },
                                  }
                                : p
                            )
                          }
                        >
                          <IconTrash />
                        </button>
                      </td>
                    ) : null}
                    <td>
                      <HubCombo
                        disabled={readOnly}
                        valueLabel={comboLabel(w.id_magazin_trash, "id_magazin_trash", magazinLabel)}
                        options={refOptions("magazin", "id_magazin_trash", magazinLabel)}
                        onPick={(opt) =>
                          setForm((p) => {
                            if (!p) return p;
                            const wastes = [...p.bundle.wastes];
                            wastes[i] = { ...wastes[i], id_magazin_trash: opt?.raw ?? null };
                            return { ...p, bundle: { ...p.bundle, wastes } };
                          })
                        }
                      />
                    </td>
                    <td>
                      <HubCombo
                        disabled={readOnly}
                        valueLabel={comboLabel(w.id_state, "id_state", (r) => str(r.state ?? r.name_group ?? r.name))}
                        options={refOptions("physicalState", "id_state", (r) => str(r.state ?? r.name_group ?? r.name))}
                        onPick={(opt) =>
                          setForm((p) => {
                            if (!p) return p;
                            const wastes = [...p.bundle.wastes];
                            wastes[i] = { ...wastes[i], id_state: opt?.raw ?? null };
                            return { ...p, bundle: { ...p.bundle, wastes } };
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="hub-input"
                        type="number"
                        disabled={readOnly}
                        value={w.weight_for_year}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setForm((p) => {
                            if (!p) return p;
                            const wastes = [...p.bundle.wastes];
                            wastes[i] = { ...wastes[i], weight_for_year: v };
                            return { ...p, bundle: { ...p.bundle, wastes } };
                          });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="hub-input"
                        type="number"
                        disabled={readOnly}
                        value={w.square_for_year}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setForm((p) => {
                            if (!p) return p;
                            const wastes = [...p.bundle.wastes];
                            wastes[i] = { ...wastes[i], square_for_year: v };
                            return { ...p, bundle: { ...p.bundle, wastes } };
                          });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </NestedTable>

              <NestedTable
                title="Окружающие здания"
                variant="tech"
                columns={["Название"]}
                readOnly={!!readOnly}
                empty={form.bundle.around.length === 0}
                onAdd={() =>
                  setForm((p) =>
                    p
                      ? {
                          ...p,
                          bundle: {
                            ...p.bundle,
                            around: [...p.bundle.around, { _key: newRowKey(), name: "" }],
                          },
                        }
                      : p
                  )
                }
              >
                {form.bundle.around.map((a, i) => (
                  <tr key={a._key}>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          title="Удалить"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    bundle: {
                                      ...p.bundle,
                                      around: p.bundle.around.filter((_, j) => j !== i),
                                    },
                                  }
                                : p
                            )
                          }
                        >
                          <IconTrash />
                        </button>
                      </td>
                    ) : null}
                    <td>
                      <input
                        className="hub-input"
                        disabled={readOnly}
                        value={a.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((p) => {
                            if (!p) return p;
                            const around = [...p.bundle.around];
                            around[i] = { ...around[i], name: v };
                            return { ...p, bundle: { ...p.bundle, around } };
                          });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </NestedTable>

              <NestedTable
                title="Природоохранные здания"
                variant="drop"
                columns={["Название"]}
                readOnly={!!readOnly}
                empty={form.bundle.natural.length === 0}
                onAdd={() =>
                  setForm((p) =>
                    p
                      ? {
                          ...p,
                          bundle: {
                            ...p.bundle,
                            natural: [...p.bundle.natural, { _key: newRowKey(), name: "" }],
                          },
                        }
                      : p
                  )
                }
              >
                {form.bundle.natural.map((a, i) => (
                  <tr key={a._key}>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          title="Удалить"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    bundle: {
                                      ...p.bundle,
                                      natural: p.bundle.natural.filter((_, j) => j !== i),
                                    },
                                  }
                                : p
                            )
                          }
                        >
                          <IconTrash />
                        </button>
                      </td>
                    ) : null}
                    <td>
                      <input
                        className="hub-input"
                        disabled={readOnly}
                        value={a.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((p) => {
                            if (!p) return p;
                            const natural = [...p.bundle.natural];
                            natural[i] = { ...natural[i], name: v };
                            return { ...p, bundle: { ...p.bundle, natural } };
                          });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </NestedTable>
            </div>

            <footer className="hub-form-footer">
              {form.mode === "view" ? (
                <button
                  type="button"
                  className="hub-btn-solid"
                  onClick={() => setForm((p) => (p ? { ...p, mode: "edit" } : p))}
                >
                  Редактировать
                </button>
              ) : (
                <button type="button" className="hub-btn-solid" disabled={saving} onClick={() => void saveForm()}>
                  {saving ? "Сохранение…" : "Сохранить изменения"}
                </button>
              )}
              <button type="button" className="hub-btn-outline" disabled={saving} onClick={() => setForm(null)}>
                {form.mode === "view" ? "Закрыть" : "Отмена"}
              </button>
              <span className="hub-form-hint">Данные сохраняются в базу РХЗО</span>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
