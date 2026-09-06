import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiGet } from "./api";
import {
  nextTempId,
  newRowKey,
  type HubFactoryBundle,
  type HubPhone,
  type HubTechnology,
  type HubDropAir,
  type HubMyTrash,
} from "./roioFactoryHubOverlay";
import {
  baselineFromBundle,
  deleteFactoryCascade,
  saveFactoryBundle,
  type HubBaselineIds,
} from "./roioFactoryHubPersist";
import { ExcludeFilterControl } from "./ExcludeFilterControl";
import { DateField, formatDateRu } from "./DateField";
import { resolveApiPath } from "./apiModule";
import "./RoioFactoryHub.css";

type Mode = "view" | "edit" | "create";

type PagePayload<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
};

type RefLists = {
  cities: Record<string, unknown>[];
  classDanger: Record<string, unknown>[];
  magazinTrash: Record<string, unknown>[];
  physState: Record<string, unknown>[];
  nameDropAir: Record<string, unknown>[];
  shortTech: Record<string, unknown>[];
};

type ComboOption = { id: string; label: string; raw: Record<string, unknown> };

/** Поле с вводом и подсказками из существующих значений (без стрелки select). */
function HubCombo(props: {
  valueLabel: string;
  options: ComboOption[];
  disabled?: boolean;
  placeholder?: string;
  allowCreate?: boolean;
  onPick: (opt: ComboOption | null) => void;
  onCreate?: (text: string) => void;
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

  const exact = props.options.find((o) => o.label.toLowerCase() === text.trim().toLowerCase());

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
        {filtered.length === 0 && !(props.allowCreate && text.trim()) ? (
          <li className="hub-combo-empty">Нет совпадений</li>
        ) : null}
        {props.allowCreate && text.trim() && !exact ? (
          <li>
            <button
              type="button"
              className="hub-combo-item hub-combo-create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                props.onCreate?.(text.trim());
                setOpen(false);
              }}
            >
              + Добавить «{text.trim()}»
            </button>
          </li>
        ) : null}
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
        autoComplete="off"
        placeholder={props.placeholder ?? "Начните вводить…"}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) props.onPick(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[0]) {
              props.onPick(filtered[0]);
              setText(filtered[0].label);
              setOpen(false);
            } else if (props.allowCreate && text.trim() && props.onCreate) {
              props.onCreate(text.trim());
              setOpen(false);
            }
          }
        }}
      />
      {dropdown}
    </div>
  );
}


const LIST_COLS: { key: string; label: string }[] = [
  { key: "id_registration", label: "Рег. номер" },
  { key: "date_register", label: "Дата регистрации" },
  { key: "name_obj", label: "Наименование объекта" },
  { key: "name_own", label: "Наименование собственника" },
  { key: "YNP", label: "УНП" },
];

const FACTORY_FIELDS: {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "bool" | "textarea" | "ref" | "derived";
  ref?: keyof RefLists;
  required?: boolean;
  row?: string;
}[] = [
  { key: "id_registration", label: "Регистрационный номер", required: true },
  { key: "date_register", label: "Дата регистрации", type: "date", row: "meta" },
  { key: "YNP", label: "УНП", row: "meta" },
  { key: "name_obj", label: "Наименование объекта", type: "textarea", required: true },
  { key: "name_own", label: "Наименование собственника", type: "textarea", required: true },
  { key: "address_own", label: "Адрес собственника", type: "textarea" },
  { key: "address_obj", label: "Адрес объекта", type: "textarea" },
  { key: "id_cities", label: "Город", type: "ref", ref: "cities" },
  { key: "__district", label: "Район", type: "derived" },
  { key: "__region", label: "Область", type: "derived" },
  { key: "id_short_discribe_technology", label: "Краткое описание технологии", type: "ref", ref: "shortTech" },
  { key: "develop_organization", label: "Организация-разработчик проекта", type: "textarea" },
  { key: "confirmed_project", label: "Утвердил проект", type: "textarea" },
  { key: "date_approve", label: "Дата утверждения", type: "date", row: "approve" },
  { key: "conclusion_documentation", label: "Орган выдавший заключение", type: "bool", row: "approve" },
  { key: "act_use", label: "Акт ввода в эксплуатацию", type: "textarea" },
  { key: "requirements_acts", label: "Требования по актам", type: "textarea" },
  { key: "obj_use_trash", label: "Использует собственные отходы", type: "bool", row: "flags" },
  { key: "obj_accept_trash", label: "Принимает отходы от других", type: "bool", row: "flags" },
  { key: "character_prod", label: "Характер продукции", type: "textarea" },
  { key: "project_power_yer", label: "Проектная мощность, т/год" },
  { key: "project_power_hr", label: "Проектная мощность, кг/час" },
  { key: "value", label: "Количество объектов", type: "number" },
];

/** Доп. поля только для «РОИО для внесения». */
const PONOINPUT_FACTORY_FIELDS: typeof FACTORY_FIELDS = [
  { key: "facticheskay_power", label: "Фактическая мощность", type: "textarea" },
  { key: "new_base", label: "Новая база", type: "bool", row: "input-flags" },
  { key: "date_approve_tech", label: "Дата утверждения технологии", type: "textarea" },
  { key: "date_input_update", label: "Дата внесения/обновления", type: "textarea" },
  { key: "admissions_by_region", label: "Допуски по регионам", type: "textarea" },
  { key: "services", label: "Услуги", type: "textarea" },
  { key: "note_services", label: "Примечание к услугам", type: "textarea" },
  { key: "mobile_unit", label: "Мобильная установка", type: "bool", row: "input-flags2" },
  { key: "excluded", label: "Исключён", type: "bool", row: "input-flags2" },
  { key: "date_excluded", label: "Дата исключения", type: "date" },
  { key: "note_excluded", label: "Примечание к исключению", type: "textarea" },
  { key: "burning", label: "Сжигание", type: "bool", row: "input-flags3" },
];

export type FactoryHubVariant = "roio" | "ponoinput";

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function cityAreaName(city: unknown, relation: "id_district" | "id_region", field: string): string {
  if (!city || typeof city !== "object") return "";
  const related = (city as Record<string, unknown>)[relation];
  if (!related || typeof related !== "object") return "";
  return str((related as Record<string, unknown>)[field]);
}

function fmtDate(v: unknown): string {
  return formatDateRu(v) || (v === null || v === undefined || v === "" ? "" : String(v));
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

function emptyFactory(): Record<string, unknown> {
  return {
    id_magasin_factory: nextTempId(),
    id_registration: "",
    date_register: "",
    name_obj: "",
    name_own: "",
    address_own: "",
    address_obj: "",
    YNP: "",
    value: 0,
    conclusion_documentation: false,
    obj_use_trash: false,
    obj_accept_trash: false,
  };
}

async function loadPagedFactoryRows(
  path: string,
  factoryId: number
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let page = 0;
  let totalPages = 1;
  do {
    const params = new URLSearchParams({
      factoryId: String(factoryId),
      page: String(page),
      size: "50",
    });
    const data = await apiGet<PagePayload<Record<string, unknown>>>(`${path}?${params}`);
    rows.push(...(Array.isArray(data.content) ? data.content : []));
    totalPages = Math.max(1, Number(data.totalPages) || 1);
    page += 1;
  } while (page < totalPages);
  return rows;
}

async function loadRelatedForFactory(
  factoryId: number,
  _registration?: string
): Promise<Pick<HubFactoryBundle, "phones" | "technologies" | "dropAirs" | "myTrashes">> {
  const [factoryDetail, techList, dropList, trashList] = await Promise.all([
    apiGet<Record<string, unknown>>(`/api/magasin-factory/${factoryId}`).catch(() => null),
    loadPagedFactoryRows("/api/technology", factoryId).catch(() => []),
    loadPagedFactoryRows("/api/drop-air", factoryId).catch(() => []),
    loadPagedFactoryRows("/api/my-trash", factoryId).catch(() => []),
  ]);

  const asList = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []);

  const phonesRaw = Array.isArray(factoryDetail?.phones) ? (factoryDetail!.phones as Record<string, unknown>[]) : [];
  const phones: HubPhone[] = phonesRaw.map((p, i) => ({
    _key: newRowKey() + i,
    id_phone_number: typeof p.id_phone_number === "number" ? p.id_phone_number : undefined,
    number: str(p.number),
    ur_ob: p.ur_ob === 1 || p.ur_ob === "1" ? 1 : p.ur_ob === 0 || p.ur_ob === "0" ? 0 : null,
  }));

  const technologies: HubTechnology[] = asList(techList).map((r) => ({
    _key: newRowKey(),
    id_technology: typeof r.id_technology === "number" ? r.id_technology : undefined,
    id_class_danger: r.id_class_danger ?? null,
    id_magazin_trash: r.id_magazin_trash ?? null,
    id_phys_trash: r.id_phys_trash ?? null,
    get: typeof r.get === "boolean" ? r.get : r.get == null ? null : Boolean(r.get),
    spot: r.spot != null ? String(r.spot) : "",
  }));

  const dropAirs: HubDropAir[] = asList(dropList).map((r) => ({
    _key: newRowKey(),
    id_drop_air: typeof r.id_drop_air === "number" ? r.id_drop_air : undefined,
    id_class_danger: r.id_class_danger ?? null,
    id_name_grope_air: r.id_name_grope_air ?? null,
    value_drop_trash: Number(r.value_drop_trash ?? 0),
  }));

  const myTrashes: HubMyTrash[] = asList(trashList).map((r) => ({
    _key: newRowKey(),
    id_my_trash: typeof r.id_my_trash === "number" ? r.id_my_trash : undefined,
    id_class_danger: r.id_class_danger ?? null,
    id_magazin_trash: r.id_magazin_trash ?? null,
    value_trash: Number(r.value_trash ?? 0),
    get: typeof r.get === "boolean" ? r.get : r.get == null ? null : Boolean(r.get),
    spot: r.spot != null ? String(r.spot) : "",
  }));

  return { phones, technologies, dropAirs, myTrashes };
}

export function RoioFactoryHub(props: { variant?: FactoryHubVariant } = {}) {
  const isPonoinput = props.variant === "ponoinput";
  const factoryFields = isPonoinput ? [...FACTORY_FIELDS, ...PONOINPUT_FACTORY_FIELDS] : FACTORY_FIELDS;
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [debouncedLocation, setDebouncedLocation] = useState("");
  const [wasteCodeFilter, setWasteCodeFilter] = useState("");
  const [debouncedWasteCode, setDebouncedWasteCode] = useState("");
  const [wasteSource, setWasteSource] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>("id_registration");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showExcluded, setShowExcluded] = useState(false);

  const [form, setForm] = useState<{
    mode: Mode;
    bundle: HubFactoryBundle;
    baseline: HubBaselineIds;
  } | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refs, setRefs] = useState<RefLists>({
    cities: [],
    classDanger: [],
    magazinTrash: [],
    physState: [],
    nameDropAir: [],
    shortTech: [],
  });

  const showToast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(search.trim());
      setDebouncedLocation(locationFilter.trim());
      setDebouncedWasteCode(wasteCodeFilter.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [search, locationFilter, wasteCodeFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, debouncedLocation, debouncedWasteCode, wasteSource, sortColumn, sortDir, pageSize, showExcluded]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(Math.max(0, page - 1)),
        size: String(pageSize),
      });
      if (debouncedQ) params.set("q", debouncedQ);
      if (debouncedLocation) params.set("location", debouncedLocation);
      if (debouncedWasteCode) params.set("wasteCode", debouncedWasteCode);
      if (wasteSource) params.set("wasteSource", wasteSource);
      if (sortColumn) {
        params.set("sort", sortColumn);
        params.set("dir", sortDir);
      }
      if (showExcluded) params.set("includeExcluded", "true");
      const data = await apiGet<PagePayload<Record<string, unknown>>>(`/api/magasin-factory?${params}`);
      const content = Array.isArray(data.content) ? data.content : [];
      setRows(content);
      setTotalElements(data.totalElements ?? content.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setRows([]);
      setTotalElements(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedQ, debouncedLocation, debouncedWasteCode, wasteSource, sortColumn, sortDir, showExcluded]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void (async () => {
      const paths: [keyof RefLists, string][] = [
        ["cities", "/api/cities"],
        ["classDanger", "/api/class-danger"],
        ["magazinTrash", "/api/magazin-trash"],
        ["physState", "/api/phys-state-trash"],
        ["nameDropAir", "/api/name-drop-air-trash"],
        ["shortTech", "/api/short-discribe-technology"],
      ];
      const next: RefLists = {
        cities: [],
        classDanger: [],
        magazinTrash: [],
        physState: [],
        nameDropAir: [],
        shortTech: [],
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
    const bundle: HubFactoryBundle = {
      factory: emptyFactory(),
      phones: [],
      technologies: [],
      dropAirs: [],
      myTrashes: [],
    };
    setForm({
      mode: "create",
      bundle,
      baseline: baselineFromBundle(bundle),
    });
  };

  const openExisting = async (row: Record<string, unknown>, mode: "view" | "edit") => {
    const id = row.id_magasin_factory;
    if (typeof id !== "number" || id <= 0) return;
    setFormBusy(true);
    try {
      const related = await loadRelatedForFactory(id, str(row.id_registration));
      const detail = await apiGet<Record<string, unknown>>(`/api/magasin-factory/${id}`).catch(() => row);
      const bundle: HubFactoryBundle = {
        factory: { ...detail },
        ...related,
      };
      setForm({
        mode,
        bundle,
        baseline: baselineFromBundle(bundle),
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка загрузки карточки", "err");
    } finally {
      setFormBusy(false);
    }
  };

  const deleteRow = async (row: Record<string, unknown>) => {
    const id = row.id_magasin_factory;
    if (typeof id !== "number" || id <= 0) return;
    if (!window.confirm("Удалить предприятие и связанные записи?")) return;
    setLoading(true);
    try {
      await deleteFactoryCascade(id, str(row.id_registration));
      showToast("Удалено");
      void loadList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка удаления", "err");
      setLoading(false);
    }
  };

  const saveForm = async () => {
    if (!form || form.mode === "view" || saving) return;
    setSaving(true);
    try {
      await saveFactoryBundle(form.mode === "create" ? "create" : "edit", form.bundle, form.baseline, {
        ponoinputExtras: isPonoinput,
      });
      showToast("Изменения сохранены");
      setForm(null);
      void loadList();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      showToast(msg || "Ошибка сохранения", "err");
    } finally {
      setSaving(false);
    }
  };

  const readOnly = form?.mode === "view";

  const updateFactoryField = (key: string, value: unknown) => {
    setForm((prev) => {
      if (!prev) return prev;
      return { ...prev, bundle: { ...prev.bundle, factory: { ...prev.bundle.factory, [key]: value } } };
    });
  };

  const refOptions = (kind: keyof RefLists, idField: string, labelField: string): ComboOption[] =>
    refs[kind].map((r) => ({
      id: String(r[idField] ?? ""),
      label: str(r[labelField]) || str(r[idField]),
      raw: r,
    }));

  const addLocalRef = (kind: keyof RefLists, idField: string, labelField: string, label: string) => {
    const id = nextTempId();
    const row: Record<string, unknown> = { [idField]: id, [labelField]: label };
    setRefs((prev) => ({ ...prev, [kind]: [...prev[kind], row] }));
    return row;
  };

  const comboLabel = (val: unknown, idField: string, labelField: string) => {
    if (val && typeof val === "object") {
      const o = val as Record<string, unknown>;
      return str(o[labelField]) || str(o[idField]);
    }
    return "";
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
        <h1 className="hub-title">Паспорт предприятия</h1>
        <div className="hub-list-toolbar-actions">
          <a
            className="hub-btn-add hub-btn-export"
            href={resolveApiPath("/api/reports/pdf")}
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
          <ExcludeFilterControl
            showExcluded={showExcluded}
            onChange={setShowExcluded}
            hasAdditionalFilters={Boolean(locationFilter || wasteCodeFilter || wasteSource)}
          >
            <label className="hub-filter-field">
              <span className="hub-filter-field-label">Область или район</span>
              <input
                type="search"
                className="hub-filter-field-control"
                placeholder="Введите название"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              />
            </label>
            <label className="hub-filter-field">
              <span className="hub-filter-field-label">Код отхода</span>
              <input
                type="search"
                className="hub-filter-field-control"
                placeholder="Введите код"
                value={wasteCodeFilter}
                onChange={(e) => setWasteCodeFilter(e.target.value)}
              />
            </label>
            <label className="hub-filter-field">
              <span className="hub-filter-field-label">Происхождение отходов</span>
              <select
                className="hub-filter-field-control"
                value={wasteSource}
                onChange={(e) => setWasteSource(e.target.value)}
              >
                <option value="">Все отходы</option>
                <option value="own">Собственные отходы</option>
                <option value="external">От сторонних организаций</option>
              </select>
            </label>
          </ExcludeFilterControl>
        </div>
        <button
          type="button"
          className="hub-link-btn"
          onClick={() => {
            setSearch("");
            setLocationFilter("");
            setWasteCodeFilter("");
            setWasteSource("");
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
                  const colClass =
                    c.key === "id_registration"
                      ? "hub-col-reg"
                      : c.key === "date_register"
                        ? "hub-col-date"
                        : c.key === "YNP"
                          ? "hub-col-ynp"
                          : undefined;
                  return (
                    <th
                      key={c.key}
                      onClick={() => sortHeaderClick(c.key)}
                      style={{ cursor: "pointer" }}
                      title={active ? (sortDir === "asc" ? "По возрастанию" : "По убыванию") : "Сортировать"}
                      className={[active ? "hub-th-sorted" : "", colClass].filter(Boolean).join(" ") || undefined}
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
                  const id = row.id_magasin_factory;
                  return (
                    <tr key={String(id)}>
                      <td className="hub-actions-col">
                        <button type="button" className="hub-icon-btn hub-icon-view" title="Просмотр" onClick={() => void openExisting(row, "view")}>
                          <IconView />
                        </button>
                        <button type="button" className="hub-icon-btn hub-icon-edit" title="Изменить" onClick={() => void openExisting(row, "edit")}>
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
                        <td
                          key={c.key}
                          className={
                            c.key === "id_registration"
                              ? "hub-col-reg"
                              : c.key === "date_register"
                                ? "hub-col-date"
                                : c.key === "YNP"
                                  ? "hub-col-ynp"
                                  : undefined
                          }
                        >
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
            <button type="button" className="hub-page-btn" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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
            <button type="button" className="hub-page-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>
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
                  ? "Создать паспорт предприятия"
                  : form.mode === "view"
                    ? "Просмотр паспорта предприятия"
                    : "Редактировать паспорт предприятия"}
              </h2>
              <button type="button" className="hub-form-close" onClick={() => setForm(null)} title="Закрыть" aria-label="Закрыть">
                <IconClose />
              </button>
            </header>

            <div className="hub-form-body">
              <section className="hub-form-block hub-form-block--main">
                <h3 className="hub-form-block-title">Основные сведения</h3>
                <div className="hub-form-grid">
                {factoryFields.map((f) => {
                  const val = form.bundle.factory[f.key];
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
                              onChange={() => updateFactoryField(f.key, true)}
                            />
                            <span>да</span>
                          </label>
                          <label className="hub-radio">
                            <input
                              type="radio"
                              disabled={readOnly}
                              checked={val !== true}
                              onChange={() => updateFactoryField(f.key, false)}
                            />
                            <span>нет</span>
                          </label>
                        </div>
                      </div>
                    );
                  }

                  if (f.type === "derived") {
                    const city = form.bundle.factory.id_cities;
                    const value =
                      f.key === "__district"
                        ? cityAreaName(city, "id_district", "name_district")
                        : cityAreaName(city, "id_region", "name_region");
                    return (
                      <div key={f.key} className="hub-field">
                        {label}
                        <input className="hub-input" disabled value={value} placeholder="Выберите город" readOnly />
                      </div>
                    );
                  }

                  if (f.type === "ref" && f.ref) {
                    const idField =
                      f.ref === "cities"
                        ? "id_cities"
                        : f.ref === "shortTech"
                          ? "id_short_discribe_technology"
                          : "id";
                    const labelField =
                      f.ref === "cities" ? "name_cities" : f.ref === "shortTech" ? "technology" : "name";
                    const opts = refOptions(f.ref, idField, labelField);
                    return (
                      <div key={f.key} className="hub-field">
                        {label}
                        <HubCombo
                          disabled={readOnly}
                          valueLabel={comboLabel(val, idField, labelField)}
                          options={opts}
                          allowCreate
                          onPick={(opt) => updateFactoryField(f.key, opt?.raw ?? null)}
                          onCreate={(text) => {
                            const created = addLocalRef(f.ref!, idField, labelField, text);
                            updateFactoryField(f.key, created);
                          }}
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
                          onChange={(e) => updateFactoryField(f.key, e.target.value)}
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
                          onChange={(iso) => updateFactoryField(f.key, iso)}
                        />
                      ) : (
                        <input
                          className="hub-input"
                          type={f.type === "number" ? "number" : "text"}
                          disabled={readOnly}
                          value={str(val)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (f.type === "number") updateFactoryField(f.key, raw === "" ? 0 : Number(raw));
                            else updateFactoryField(f.key, raw);
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
                            phones: [...p.bundle.phones, { _key: newRowKey(), number: "", ur_ob: null }],
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
                        value={ph.ur_ob === 0 || ph.ur_ob === 1 ? String(ph.ur_ob) : ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const v: 0 | 1 | null = raw === "" ? null : raw === "1" ? 1 : 0;
                          setForm((p) => {
                            if (!p) return p;
                            const phones = [...p.bundle.phones];
                            phones[i] = { ...phones[i], ur_ob: v };
                            return { ...p, bundle: { ...p.bundle, phones } };
                          });
                        }}
                      >
                        <option value="">Выберите…</option>
                        <option value="0">Собственник</option>
                        <option value="1">Объект</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </NestedTable>

              <NestedTable
                title="Технологии"
                variant="tech"
                columns={
                  isPonoinput
                    ? ["Класс опасности", "Отход", "Физ. состояние", "Получение", "Место"]
                    : ["Класс опасности", "Отход", "Физ. состояние"]
                }
                readOnly={!!readOnly}
                empty={form.bundle.technologies.length === 0}
                onAdd={() =>
                  setForm((p) =>
                    p
                      ? {
                          ...p,
                          bundle: {
                            ...p.bundle,
                            technologies: [
                              ...p.bundle.technologies,
                              {
                                _key: newRowKey(),
                                id_class_danger: null,
                                id_magazin_trash: null,
                                id_phys_trash: null,
                                get: false,
                                spot: "",
                              },
                            ],
                          },
                        }
                      : p
                  )
                }
              >
                {form.bundle.technologies.map((t, i) => (
                  <tr key={t._key}>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    bundle: {
                                      ...p.bundle,
                                      technologies: p.bundle.technologies.filter((_, j) => j !== i),
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
                    {(
                      [
                        ["id_class_danger", "classDanger", "id_class_danger", "class_danger"],
                        ["id_magazin_trash", "magazinTrash", "id_magazin_trash", "name_trash"],
                        ["id_phys_trash", "physState", "id_mame_group", "name_group"],
                      ] as const
                    ).map(([field, refKey, idField, labelField]) => (
                      <td key={field}>
                        <HubCombo
                          disabled={readOnly}
                          valueLabel={comboLabel(t[field], idField, labelField)}
                          options={refOptions(refKey, idField, labelField)}
                          allowCreate
                          onPick={(opt) => {
                            setForm((p) => {
                              if (!p) return p;
                              const technologies = [...p.bundle.technologies];
                              technologies[i] = { ...technologies[i], [field]: opt?.raw ?? null };
                              return { ...p, bundle: { ...p.bundle, technologies } };
                            });
                          }}
                          onCreate={(text) => {
                            const created = addLocalRef(refKey, idField, labelField, text);
                            setForm((p) => {
                              if (!p) return p;
                              const technologies = [...p.bundle.technologies];
                              technologies[i] = { ...technologies[i], [field]: created };
                              return { ...p, bundle: { ...p.bundle, technologies } };
                            });
                          }}
                        />
                      </td>
                    ))}
                    {isPonoinput ? (
                      <>
                        <td>
                          <div className="hub-radios">
                            <label className="hub-radio">
                              <input
                                type="radio"
                                disabled={readOnly}
                                checked={t.get === true}
                                onChange={() =>
                                  setForm((p) => {
                                    if (!p) return p;
                                    const technologies = [...p.bundle.technologies];
                                    technologies[i] = { ...technologies[i], get: true };
                                    return { ...p, bundle: { ...p.bundle, technologies } };
                                  })
                                }
                              />
                              <span>да</span>
                            </label>
                            <label className="hub-radio">
                              <input
                                type="radio"
                                disabled={readOnly}
                                checked={t.get !== true}
                                onChange={() =>
                                  setForm((p) => {
                                    if (!p) return p;
                                    const technologies = [...p.bundle.technologies];
                                    technologies[i] = { ...technologies[i], get: false };
                                    return { ...p, bundle: { ...p.bundle, technologies } };
                                  })
                                }
                              />
                              <span>нет</span>
                            </label>
                          </div>
                        </td>
                        <td>
                          <input
                            className="hub-input"
                            disabled={readOnly}
                            value={t.spot ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setForm((p) => {
                                if (!p) return p;
                                const technologies = [...p.bundle.technologies];
                                technologies[i] = { ...technologies[i], spot: v };
                                return { ...p, bundle: { ...p.bundle, technologies } };
                              });
                            }}
                          />
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </NestedTable>

              <NestedTable
                title="Выбросы"
                variant="drop"
                columns={["Класс опасности", "Наименование", "Значение, т/год"]}
                readOnly={!!readOnly}
                empty={form.bundle.dropAirs.length === 0}
                onAdd={() =>
                  setForm((p) =>
                    p
                      ? {
                          ...p,
                          bundle: {
                            ...p.bundle,
                            dropAirs: [
                              ...p.bundle.dropAirs,
                              {
                                _key: newRowKey(),
                                id_class_danger: null,
                                id_name_grope_air: null,
                                value_drop_trash: 0,
                              },
                            ],
                          },
                        }
                      : p
                  )
                }
              >
                {form.bundle.dropAirs.map((d, i) => (
                  <tr key={d._key}>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    bundle: {
                                      ...p.bundle,
                                      dropAirs: p.bundle.dropAirs.filter((_, j) => j !== i),
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
                        valueLabel={comboLabel(d.id_class_danger, "id_class_danger", "class_danger")}
                        options={refOptions("classDanger", "id_class_danger", "class_danger")}
                        allowCreate
                        onPick={(opt) => {
                          setForm((p) => {
                            if (!p) return p;
                            const dropAirs = [...p.bundle.dropAirs];
                            dropAirs[i] = { ...dropAirs[i], id_class_danger: opt?.raw ?? null };
                            return { ...p, bundle: { ...p.bundle, dropAirs } };
                          });
                        }}
                        onCreate={(text) => {
                          const created = addLocalRef("classDanger", "id_class_danger", "class_danger", text);
                          setForm((p) => {
                            if (!p) return p;
                            const dropAirs = [...p.bundle.dropAirs];
                            dropAirs[i] = { ...dropAirs[i], id_class_danger: created };
                            return { ...p, bundle: { ...p.bundle, dropAirs } };
                          });
                        }}
                      />
                    </td>
                    <td>
                      <HubCombo
                        disabled={readOnly}
                        valueLabel={comboLabel(d.id_name_grope_air, "id_name_grope_air", "name_drop_air_trash")}
                        options={refOptions("nameDropAir", "id_name_grope_air", "name_drop_air_trash")}
                        allowCreate
                        onPick={(opt) => {
                          setForm((p) => {
                            if (!p) return p;
                            const dropAirs = [...p.bundle.dropAirs];
                            dropAirs[i] = { ...dropAirs[i], id_name_grope_air: opt?.raw ?? null };
                            return { ...p, bundle: { ...p.bundle, dropAirs } };
                          });
                        }}
                        onCreate={(text) => {
                          const created = addLocalRef(
                            "nameDropAir",
                            "id_name_grope_air",
                            "name_drop_air_trash",
                            text
                          );
                          setForm((p) => {
                            if (!p) return p;
                            const dropAirs = [...p.bundle.dropAirs];
                            dropAirs[i] = { ...dropAirs[i], id_name_grope_air: created };
                            return { ...p, bundle: { ...p.bundle, dropAirs } };
                          });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="hub-input"
                        type="number"
                        disabled={readOnly}
                        value={d.value_drop_trash}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setForm((p) => {
                            if (!p) return p;
                            const dropAirs = [...p.bundle.dropAirs];
                            dropAirs[i] = { ...dropAirs[i], value_drop_trash: v };
                            return { ...p, bundle: { ...p.bundle, dropAirs } };
                          });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </NestedTable>

              <NestedTable
                title="Отходы предприятия"
                variant="trash"
                columns={
                  isPonoinput
                    ? ["Класс опасности", "Отход", "Количество, т", "Получение", "Место"]
                    : ["Класс опасности", "Отход", "Количество, т"]
                }
                readOnly={!!readOnly}
                empty={form.bundle.myTrashes.length === 0}
                onAdd={() =>
                  setForm((p) =>
                    p
                      ? {
                          ...p,
                          bundle: {
                            ...p.bundle,
                            myTrashes: [
                              ...p.bundle.myTrashes,
                              {
                                _key: newRowKey(),
                                id_class_danger: null,
                                id_magazin_trash: null,
                                value_trash: 0,
                                get: false,
                                spot: "",
                              },
                            ],
                          },
                        }
                      : p
                  )
                }
              >
                {form.bundle.myTrashes.map((m, i) => (
                  <tr key={m._key}>
                    {!readOnly ? (
                      <td>
                        <button
                          type="button"
                          className="hub-icon-btn hub-icon-danger"
                          onClick={() =>
                            setForm((p) =>
                              p
                                ? {
                                    ...p,
                                    bundle: {
                                      ...p.bundle,
                                      myTrashes: p.bundle.myTrashes.filter((_, j) => j !== i),
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
                        valueLabel={comboLabel(m.id_class_danger, "id_class_danger", "class_danger")}
                        options={refOptions("classDanger", "id_class_danger", "class_danger")}
                        allowCreate
                        onPick={(opt) => {
                          setForm((p) => {
                            if (!p) return p;
                            const myTrashes = [...p.bundle.myTrashes];
                            myTrashes[i] = { ...myTrashes[i], id_class_danger: opt?.raw ?? null };
                            return { ...p, bundle: { ...p.bundle, myTrashes } };
                          });
                        }}
                        onCreate={(text) => {
                          const created = addLocalRef("classDanger", "id_class_danger", "class_danger", text);
                          setForm((p) => {
                            if (!p) return p;
                            const myTrashes = [...p.bundle.myTrashes];
                            myTrashes[i] = { ...myTrashes[i], id_class_danger: created };
                            return { ...p, bundle: { ...p.bundle, myTrashes } };
                          });
                        }}
                      />
                    </td>
                    <td>
                      <HubCombo
                        disabled={readOnly}
                        valueLabel={comboLabel(m.id_magazin_trash, "id_magazin_trash", "name_trash")}
                        options={refOptions("magazinTrash", "id_magazin_trash", "name_trash")}
                        allowCreate
                        onPick={(opt) => {
                          setForm((p) => {
                            if (!p) return p;
                            const myTrashes = [...p.bundle.myTrashes];
                            myTrashes[i] = { ...myTrashes[i], id_magazin_trash: opt?.raw ?? null };
                            return { ...p, bundle: { ...p.bundle, myTrashes } };
                          });
                        }}
                        onCreate={(text) => {
                          const created = addLocalRef("magazinTrash", "id_magazin_trash", "name_trash", text);
                          setForm((p) => {
                            if (!p) return p;
                            const myTrashes = [...p.bundle.myTrashes];
                            myTrashes[i] = { ...myTrashes[i], id_magazin_trash: created };
                            return { ...p, bundle: { ...p.bundle, myTrashes } };
                          });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="hub-input"
                        type="number"
                        disabled={readOnly}
                        value={m.value_trash}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setForm((p) => {
                            if (!p) return p;
                            const myTrashes = [...p.bundle.myTrashes];
                            myTrashes[i] = { ...myTrashes[i], value_trash: v };
                            return { ...p, bundle: { ...p.bundle, myTrashes } };
                          });
                        }}
                      />
                    </td>
                    {isPonoinput ? (
                      <>
                        <td>
                          <div className="hub-radios">
                            <label className="hub-radio">
                              <input
                                type="radio"
                                disabled={readOnly}
                                checked={m.get === true}
                                onChange={() =>
                                  setForm((p) => {
                                    if (!p) return p;
                                    const myTrashes = [...p.bundle.myTrashes];
                                    myTrashes[i] = { ...myTrashes[i], get: true };
                                    return { ...p, bundle: { ...p.bundle, myTrashes } };
                                  })
                                }
                              />
                              <span>да</span>
                            </label>
                            <label className="hub-radio">
                              <input
                                type="radio"
                                disabled={readOnly}
                                checked={m.get !== true}
                                onChange={() =>
                                  setForm((p) => {
                                    if (!p) return p;
                                    const myTrashes = [...p.bundle.myTrashes];
                                    myTrashes[i] = { ...myTrashes[i], get: false };
                                    return { ...p, bundle: { ...p.bundle, myTrashes } };
                                  })
                                }
                              />
                              <span>нет</span>
                            </label>
                          </div>
                        </td>
                        <td>
                          <input
                            className="hub-input"
                            disabled={readOnly}
                            value={m.spot ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setForm((p) => {
                                if (!p) return p;
                                const myTrashes = [...p.bundle.myTrashes];
                                myTrashes[i] = { ...myTrashes[i], spot: v };
                                return { ...p, bundle: { ...p.bundle, myTrashes } };
                              });
                            }}
                          />
                        </td>
                      </>
                    ) : null}
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
              <span className="hub-form-hint">
                {isPonoinput
                  ? "Данные сохраняются в базу РОИО (для внесения)"
                  : "Данные сохраняются в базу РОИО"}
              </span>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
