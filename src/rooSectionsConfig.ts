import { apiGet, getNestedId } from "./api";
import { ROO_GRID_REF_SPECS, type RooGridRefKind } from "./rooGridRefConfig";

export type { RooGridRefKind } from "./rooGridRefConfig";

export type RooSectionId =
  | "magasin-factory"
  | "my-trash"
  | "drop-air"
  | "magazin-trash"
  | "technology"
  | "class-danger"
  | "phys-state-trash"
  | "short-discribe-technology"
  | "name-drop-air-trash"
  | "region"
  | "district"
  | "cities"
  | "number-phone";

export type RooCol = {
  key: string;
  label: string;
  type?: "text" | "number" | "float" | "bool" | "date";
  readOnly?: boolean;
  multiline?: boolean;
  format?: (row: Record<string, unknown>) => string;
  gridRef?: RooGridRefKind;
  /** Подпись в ячейке для gridRef (без изменения списка в модалке справочника). */
  gridRefDisplay?: (r: Record<string, unknown>) => string;
  /** Для gridRef numberPhone: 0 — юр. лицо, 1 — объект */
  phoneUrOb?: 0 | 1;
};

type RooPhoneKind = "legal" | "owner";

function phoneKindMatches(rec: Record<string, unknown>, kind: RooPhoneKind): boolean {
  const raw = rec.ur_ob;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return false;
  if (n === 3) return true;
  return kind === "legal" ? n === 0 : n === 1;
}

function formatPhonesByKind(row: Record<string, unknown>, kind: RooPhoneKind): string {
  const phones = row.phones;
  if (!Array.isArray(phones)) return "";
  return phones
    .filter((x) => x && typeof x === "object" && phoneKindMatches(x as Record<string, unknown>, kind))
    .map((x) => S((x as Record<string, unknown>).number))
    .filter(Boolean)
    .join(", ");
}

function nestedName(row: Record<string, unknown>, ...path: string[]): string {
  let cur: unknown = row;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[key];
  }
  return S(cur);
}

function formatFactoryRegion(row: Record<string, unknown>): string {
  return nestedName(row, "id_cities", "id_region", "name_region");
}

function formatFactoryDistrict(row: Record<string, unknown>): string {
  return nestedName(row, "id_cities", "id_district", "name_district");
}

export type RooSectionDef = {
  apiPath: string;
  idField: string;
  title: string;
  sidebar: string;
  columns: RooCol[];
  toRequest: (row: Record<string, unknown>) => Record<string, unknown>;
  createDefault: () => Promise<Record<string, unknown>>;
};

function S(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function pickFk(val: unknown, nestedIdField: string): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  return getNestedId(val, nestedIdField) ?? 0;
}

/** FK для API: пустой выбор → null (не 0 — иначе бэкенд ищет id=0). */
export function pickFkOrNull(
  val: unknown,
  nestedIdField: string
): number | null {
  const id = pickFk(val, nestedIdField);
  return id > 0 ? id : null;
}

function optStr(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v === null || v === undefined || v === "") return undefined;
  return String(v);
}

function optDate(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v === null || v === undefined || v === "") return undefined;
  return String(v).slice(0, 10);
}

function optBool(row: Record<string, unknown>, key: string): boolean | undefined {
  const v = row[key];
  if (v === null || v === undefined) return undefined;
  return Boolean(v);
}

function magasinFactoryToRequest(row: Record<string, unknown>): Record<string, unknown> {
  const citiesId = pickFk(row.id_cities, "id_cities");
  const shortId = pickFk(row.id_short_discribe_technology, "id_short_discribe_technology");
  const techId = pickFk(row.id_technology, "id_technology");
  let reg = S(row.id_registration).trim().slice(0, 10);
  if (!reg) reg = `R${Date.now() % 1e7}`.slice(0, 10);
  return {
    id_registration: reg,
    date_register: optDate(row, "date_register"),
    id_cities: citiesId > 0 ? citiesId : undefined,
    id_short_discribe_technology: shortId > 0 ? shortId : undefined,
    id_technology: techId > 0 ? techId : undefined,
    name_obj: S(row.name_obj).trim() || "Объект",
    name_own: S(row.name_own).trim() || "Владелец",
    address_own: S(row.address_own).trim() || "—",
    address_obj: S(row.address_obj).trim() || "—",
    develop_organization: optStr(row, "develop_organization"),
    confirmed_project: optStr(row, "confirmed_project"),
    date_approve: optDate(row, "date_approve"),
    conclusion_documentation: optBool(row, "conclusion_documentation"),
    act_use: optStr(row, "act_use"),
    requirements_acts: optStr(row, "requirements_acts"),
    obj_use_trash: optBool(row, "obj_use_trash"),
    obj_accept_trash: optBool(row, "obj_accept_trash"),
    character_prod: optStr(row, "character_prod"),
    project_power_yer: optStr(row, "project_power_yer"),
    project_power_hr: optStr(row, "project_power_hr"),
    facticheskay_power: optStr(row, "facticheskay_power"),
    YNP: optStr(row, "YNP") ?? optStr(row, "ynp"),
    value: Number(row.value ?? 0),
  };
}

export function rooCellValue(
  row: Record<string, unknown>,
  col: RooCol,
  gridRefCache?: Record<RooGridRefKind, Record<string, unknown>[]>
): string {
  if (col.format) return col.format(row);
  if (col.key === "__region" || col.key === "__district") {
    const direct = col.key === "__region" ? formatFactoryRegion(row) : formatFactoryDistrict(row);
    if (direct) return direct;
    const cityId = pickFk(row.id_cities, "id_cities");
    if (cityId > 0 && gridRefCache?.cities) {
      const city = gridRefCache.cities.find((c) => pickFk(c, "id_cities") === cityId);
      if (city) {
        return col.key === "__region"
          ? S(city.id_region && typeof city.id_region === "object"
              ? (city.id_region as Record<string, unknown>).name_region
              : "")
          : S(city.id_district && typeof city.id_district === "object"
              ? (city.id_district as Record<string, unknown>).name_district
              : "");
      }
    }
    return "";
  }
  if (col.gridRef === "numberPhone" && col.phoneUrOb !== undefined) {
    return formatPhonesByKind(row, col.phoneUrOb === 0 ? "legal" : "owner");
  }
  if (col.gridRef) {
    const spec = ROO_GRID_REF_SPECS[col.gridRef];
    const display = col.gridRefDisplay ?? spec.display;
    const v = row[col.key];
    if (v && typeof v === "object") return display(v as Record<string, unknown>);
    const id = typeof v === "number" ? v : getNestedId(v, spec.idField);
    if (id != null && gridRefCache) {
      const found = gridRefCache[col.gridRef].find((r) => pickFk(r, spec.idField) === id);
      if (found) return display(found);
    }
    return id != null ? String(id) : "";
  }
  const v = row[col.key];
  if (col.type === "bool") return v === true ? "Да" : v === false ? "Нет" : "";
  return S(v);
}

export const ROO_SECTIONS: Record<RooSectionId, RooSectionDef> = {
  "magasin-factory": {
    apiPath: "/api/magasin-factory",
    idField: "id_magasin_factory",
    title: "Справочник предприятий (MagasinFactory)",
    sidebar: "Предприятия",
    columns: [
      { key: "id_registration", label: "Регистрационный номер", type: "text", multiline: false },
      { key: "date_register", label: "Дата регистрации", type: "date" },
      { key: "name_obj", label: "Наименование объекта", type: "text", multiline: true },
      { key: "name_own", label: "Наименование собственника", type: "text", multiline: true },
      { key: "YNP", label: "УНП", type: "text", multiline: false },
      { key: "address_own", label: "Сведения о собственнике: адрес", type: "text", multiline: true },
      {
        key: "__phones_legal",
        label: "Сведения о собственнике: телефон",
        gridRef: "numberPhone",
        phoneUrOb: 0,
      },
      { key: "address_obj", label: "Адрес объекта", type: "text", multiline: true },
      {
        key: "__phones_owner",
        label: "Телефон объекта",
        gridRef: "numberPhone",
        phoneUrOb: 1,
      },
      { key: "id_cities", label: "Город", gridRef: "cities" },
      {
        key: "__region",
        label: "Область объекта",
        readOnly: true,
        format: formatFactoryRegion,
      },
      {
        key: "__district",
        label: "Район объекта",
        readOnly: true,
        format: formatFactoryDistrict,
      },
      { key: "develop_organization", label: "Организация-разработчик проекта", type: "text", multiline: true },
      { key: "confirmed_project", label: "Утвердил проект", type: "text", multiline: true },
      { key: "date_approve", label: "Дата утверждения", type: "date" },
      { key: "conclusion_documentation", label: "Орган выдавший заключение", type: "bool" },
      { key: "act_use", label: "Акт ввода в эксплуатацию", type: "text", multiline: true },
      {
        key: "id_short_discribe_technology",
        label: "Краткое описание технологии",
        gridRef: "shortDiscribeTechnology",
      },
      { key: "requirements_acts", label: "Требования по актам", type: "text", multiline: true },
      { key: "obj_use_trash", label: "Предпр. использ. собственные отходы", type: "bool" },
      { key: "obj_accept_trash", label: "Предпр. принимает от др.", type: "bool" },
      { key: "character_prod", label: "Характер продукции", type: "text", multiline: true },
      { key: "project_power_yer", label: "Проектная мощность, т/год", type: "text", multiline: true },
      { key: "project_power_hr", label: "Проектная мощность, кг/час", type: "text", multiline: true },
      { key: "value", label: "Количество объектов", type: "number" },
    ],
    toRequest: magasinFactoryToRequest,
    createDefault: async () => {
      const stamp = Date.now() % 1e7;
      return {
        id_registration: `R${stamp}`.slice(0, 10),
        name_obj: "Новый объект",
        name_own: "Владелец",
        address_own: "—",
        address_obj: "—",
        value: 0,
      };
    },
  },
  "my-trash": {
    apiPath: "/api/my-trash",
    idField: "id_my_trash",
    title: "Отходы предприятия (MyTrash)",
    sidebar: "Отходы предприятия",
    columns: [
      {
        key: "id_magasin_factory",
        label: "Предприятие",
        gridRef: "magasinFactory",
        gridRefDisplay: (r) => S(r.name_obj),
      },
      { key: "id_class_danger", label: "Класс опасности", gridRef: "classDanger" },
      {
        key: "id_magazin_trash",
        label: "Отход",
        gridRef: "magazinTrash",
        gridRefDisplay: (r) => S(r.name_trash),
      },
      { key: "value_trash", label: "Количество, т", type: "float" },
    ],
    toRequest: (row) => ({
      id_class_danger: pickFkOrNull(row.id_class_danger, "id_class_danger"),
      id_magazin_trash: pickFkOrNull(row.id_magazin_trash, "id_magazin_trash"),
      id_magasin_factory: pickFkOrNull(row.id_magasin_factory, "id_magasin_factory"),
      value_trash: Number(row.value_trash ?? 0),
    }),
    createDefault: async () => {
      const [factories, trash] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/magasin-factory"),
        apiGet<Record<string, unknown>[]>("/api/magazin-trash"),
      ]);
      return {
        id_magasin_factory: pickFkOrNull(factories[0], "id_magasin_factory"),
        id_class_danger: null,
        id_magazin_trash: pickFkOrNull(trash[0], "id_magazin_trash"),
        value_trash: 0,
      };
    },
  },
  "drop-air": {
    apiPath: "/api/drop-air",
    idField: "id_drop_air",
    title: "Выбросы в атмосферу (DropAir)",
    sidebar: "Выбросы",
    columns: [
      {
        key: "id_magasin_factory",
        label: "Предприятие",
        gridRef: "magasinFactory",
        gridRefDisplay: (r) => S(r.name_obj),
      },
      { key: "id_class_danger", label: "Класс опасности", gridRef: "classDanger" },
      { key: "id_name_grope_air", label: "Наименование выброса", gridRef: "nameDropAirTrash" },
      { key: "value_drop_trash", label: "Значение, т/год", type: "float" },
    ],
    toRequest: (row) => ({
      id_class_danger: pickFk(row.id_class_danger, "id_class_danger"),
      id_name_grope_air: pickFk(row.id_name_grope_air, "id_name_grope_air"),
      id_magasin_factory: pickFk(row.id_magasin_factory, "id_magasin_factory"),
      value_drop_trash: Number(row.value_drop_trash ?? 0),
    }),
    createDefault: async () => {
      const [factories, classes, names] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/magasin-factory"),
        apiGet<Record<string, unknown>[]>("/api/class-danger"),
        apiGet<Record<string, unknown>[]>("/api/name-drop-air-trash"),
      ]);
      return {
        id_magasin_factory: pickFk(factories[0], "id_magasin_factory"),
        id_class_danger: pickFk(classes[0], "id_class_danger"),
        id_name_grope_air: pickFk(names[0], "id_name_grope_air"),
        value_drop_trash: 1,
      };
    },
  },
  "magazin-trash": {
    apiPath: "/api/magazin-trash",
    idField: "id_magazin_trash",
    title: "Справочник отходов (MagazinTrash)",
    sidebar: "Справочник отходов",
    columns: [
      { key: "code_trash", label: "Код отхода", type: "number" },
      { key: "name_trash", label: "Наименование отхода", type: "text", multiline: true },
      { key: "id_class_danger", label: "Класс опасности", gridRef: "classDanger" },
    ],
    toRequest: (row) => ({
      id_class_danger: pickFk(row.id_class_danger, "id_class_danger"),
      code_trash: Number(row.code_trash ?? 10000000),
      name_trash: S(row.name_trash).trim() || "Отход",
    }),
    createDefault: async () => {
      const classes = await apiGet<Record<string, unknown>[]>("/api/class-danger");
      return {
        id_class_danger: pickFk(classes[0], "id_class_danger"),
        code_trash: 10000000 + (Date.now() % 89999999),
        name_trash: "Новый отход",
      };
    },
  },
  technology: {
    apiPath: "/api/technology",
    idField: "id_technology",
    title: "Технологии (Technology)",
    sidebar: "Технологии",
    columns: [
      {
        key: "id_magasin_factory",
        label: "Предприятие",
        gridRef: "magasinFactory",
        gridRefDisplay: (r) => S(r.name_obj),
      },
      { key: "id_class_danger", label: "Класс опасности", gridRef: "classDanger" },
      {
        key: "id_magazin_trash",
        label: "Отход",
        gridRef: "magazinTrash",
        gridRefDisplay: (r) => S(r.name_trash),
      },
      { key: "id_phys_trash", label: "Физ. состояние", gridRef: "physStateTrash" },
    ],
    toRequest: (row) => {
      const factoryId = pickFk(row.id_magasin_factory, "id_magasin_factory");
      return {
        id_class_danger: pickFk(row.id_class_danger, "id_class_danger"),
        id_magazin_trash: pickFk(row.id_magazin_trash, "id_magazin_trash"),
        id_phys_trash: pickFk(row.id_phys_trash, "id_mame_group"),
        id_magasin_factory: factoryId > 0 ? factoryId : null,
      };
    },
    createDefault: async () => {
      const [factories, classes, trash, phys] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/magasin-factory"),
        apiGet<Record<string, unknown>[]>("/api/class-danger"),
        apiGet<Record<string, unknown>[]>("/api/magazin-trash"),
        apiGet<Record<string, unknown>[]>("/api/phys-state-trash"),
      ]);
      return {
        id_magasin_factory: pickFk(factories[0], "id_magasin_factory"),
        id_class_danger: pickFk(classes[0], "id_class_danger"),
        id_magazin_trash: pickFk(trash[0], "id_magazin_trash"),
        id_phys_trash: pickFk(phys[0], "id_mame_group"),
      };
    },
  },
  "class-danger": {
    apiPath: "/api/class-danger",
    idField: "id_class_danger",
    title: "Классы опасности (ClassDanger)",
    sidebar: "Класс опасности",
    columns: [{ key: "class_danger", label: "Класс (число)", type: "number" }],
    toRequest: (row) => ({ classDanger: Number(row.class_danger ?? 0) }),
    createDefault: async () => ({ classDanger: 1 }),
  },
  "phys-state-trash": {
    apiPath: "/api/phys-state-trash",
    idField: "id_mame_group",
    title: "Физическое состояние отхода (PhysStateTrash)",
    sidebar: "Физ. состояние",
    columns: [{ key: "name_group", label: "Состояние", type: "text" }],
    toRequest: (row) => ({ name_group: S(row.name_group).trim() || "Состояние" }),
    createDefault: async () => ({ name_group: "Твёрдое" }),
  },
  "short-discribe-technology": {
    apiPath: "/api/short-discribe-technology",
    idField: "id_short_discribe_technology",
    title: "Краткое описание технологии (ShortDiscribeTechnology)",
    sidebar: "Описание технологии",
    columns: [{ key: "technology", label: "Описание", type: "text", multiline: true }],
    toRequest: (row) => ({ technology: S(row.technology).trim() || "Технология" }),
    createDefault: async () => ({ technology: "Новая технология" }),
  },
  "name-drop-air-trash": {
    apiPath: "/api/name-drop-air-trash",
    idField: "id_name_grope_air",
    title: "Наименования выбросов (NameDropAirTrash)",
    sidebar: "Наим. выбросов",
    columns: [{ key: "name_drop_air_trash", label: "Наименование", type: "text", multiline: true }],
    toRequest: (row) => ({
      name_drop_air_trash: S(row.name_drop_air_trash).trim() || "Выброс",
    }),
    createDefault: async () => ({ name_drop_air_trash: "Новый выброс" }),
  },
  region: {
    apiPath: "/api/region",
    idField: "id_region",
    title: "Области (Region)",
    sidebar: "Области",
    columns: [{ key: "name_region", label: "Название области", type: "text" }],
    toRequest: (row) => ({ nameRegion: S(row.name_region).trim() || "Область" }),
    createDefault: async () => ({ nameRegion: "Новая область" }),
  },
  district: {
    apiPath: "/api/district",
    idField: "id_district",
    title: "Районы (District)",
    sidebar: "Районы",
    columns: [{ key: "name_district", label: "Название района", type: "text" }],
    toRequest: (row) => ({ name_district: S(row.name_district).trim() || "Район" }),
    createDefault: async () => ({ name_district: "Новый район" }),
  },
  cities: {
    apiPath: "/api/cities",
    idField: "id_cities",
    title: "Города (Cities)",
    sidebar: "Города",
    columns: [
      { key: "name_cities", label: "Город", type: "text" },
      { key: "index", label: "Индекс", type: "text" },
      { key: "id_district", label: "Район", gridRef: "district" },
      { key: "id_region", label: "Область", gridRef: "region" },
    ],
    toRequest: (row) => {
      const reg = row.id_region;
      let idRegion = 1;
      if (typeof reg === "number") idRegion = reg;
      else if (reg && typeof reg === "object")
        idRegion = Number((reg as Record<string, unknown>).id_region) || 1;
      return {
        idRegion,
        idDistrict: pickFk(row.id_district, "id_district"),
        name_cities: S(row.name_cities).trim() || "Город",
        index: S(row.index).trim() || "000000",
      };
    },
    createDefault: async () => {
      const [regions, districts] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/region"),
        apiGet<Record<string, unknown>[]>("/api/district"),
      ]);
      return {
        idRegion: pickFk(regions[0], "id_region") || 1,
        idDistrict: pickFk(districts[0], "id_district") || 1,
        name_cities: "Новый город",
        index: "000000",
      };
    },
  },
  "number-phone": {
    apiPath: "/api/number-phone",
    idField: "id_phone_number",
    title: "Телефоны (NumberPhone)",
    sidebar: "Телефоны",
    columns: [{ key: "number", label: "Номер", type: "text" }],
    toRequest: (row) => ({
      number: S(row.number).trim() || "+375000000000",
      ur_ob: 0,
    }),
    createDefault: async () => ({
      number: "+375000000000",
      ur_ob: 0,
    }),
  },
};

/** Порядок в боковом меню: предприятия первыми. */
export const ROO_SECTION_ORDER: RooSectionId[] = [
  "magasin-factory",
  "my-trash",
  "drop-air",
  "magazin-trash",
  "technology",
  "class-danger",
  "phys-state-trash",
  "short-discribe-technology",
  "name-drop-air-trash",
  "region",
  "district",
  "cities",
  "number-phone",
];

export function getRooSection(id: RooSectionId): RooSectionDef {
  return ROO_SECTIONS[id];
}
