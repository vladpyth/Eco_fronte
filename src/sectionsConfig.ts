import { apiGet, getNestedId } from "./api";

export type GridSectionId =
  | "around-build"
  | "characteristic-trash"
  | "cities"
  | "classDanger"
  | "cleaner-builds"
  | "comments-of-place"
  | "group-place-save"
  | "gruops-degree"
  | "level-trash"
  | "magazin-trash"
  | "name-group"
  | "natual-save-building"
  | "number-phone"
  | "physical-state"
  | "region"
  | "storage-scheme"
  | "type-trash1";

export type SectionId = "objects" | GridSectionId;

export type SimpleCol = {
  key: string;
  label: string;
  type?: "text" | "number" | "float" | "bool" | "date";
  readOnly?: boolean;
  format?: (row: Record<string, unknown>) => string;
};

export type GridSectionDef = {
  apiPath: string;
  idField: string;
  title: string;
  sidebar: string;
  icon: string;
  columns: SimpleCol[];
  toRequest: (row: Record<string, unknown>) => Record<string, unknown>;
  createDefault: () => Promise<Record<string, unknown>>;
};

function S(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** ID из числа в строке или из вложенного объекта сущности */
export function pickFk(val: unknown, nestedIdField: string): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  return getNestedId(val, nestedIdField) ?? 0;
}

function cellStr(row: Record<string, unknown>, col: SimpleCol): string {
  if (col.format) return col.format(row);
  const v = row[col.key];
  if (col.type === "bool")
    return v === true ? "Да" : v === false ? "Нет" : "";
  return S(v);
}

export function gridCellValue(row: Record<string, unknown>, col: SimpleCol): string {
  return cellStr(row, col);
}

export const OBJECT_SECTION = {
  title: "Объекты размещения отходов (ObjectPlaceTrash)",
  sidebar: "Объекты",
  icon: "📌",
} as const;

export const GRID_SECTIONS: Record<GridSectionId, GridSectionDef> = {
  "around-build": {
    apiPath: "/api/around-build",
    idField: "id_around_build",
    title: "Здания вокруг объекта (AroundBuild)",
    sidebar: "Окр. здания",
    icon: "🏠",
    columns: [{ key: "name", label: "Название", type: "text" }],
    toRequest: (row) => ({ name: S(row.name) }),
    createDefault: async () => ({ name: "Новое здание" }),
  },
  "natual-save-building": {
    apiPath: "/api/natual-save-building",
    idField: "id_natual_save_build",
    title: "Здания природоохранного назначения (NatualSaveBuilding)",
    sidebar: "Природоохр. здания",
    icon: "🌿",
    columns: [{ key: "name", label: "Название", type: "text" }],
    toRequest: (row) => ({ name: S(row.name) }),
    createDefault: async () => ({ name: "Новое здание" }),
  },
  classDanger: {
    apiPath: "/api/classDanger",
    idField: "id_class_danger",
    title: "Классы опасности (ClassDanger)",
    sidebar: "Класс опасности",
    icon: "☣️",
    columns: [{ key: "class_danger", label: "Класс (число)", type: "number" }],
    toRequest: (row) => ({ classDanger: Number(row.class_danger ?? 0) }),
    createDefault: async () => ({ classDanger: 1 }),
  },
  "type-trash1": {
    apiPath: "/api/type-trash1",
    idField: "id_type_trash1",
    title: "Типы отходов (TypeTrash1)",
    sidebar: "Типы отходов",
    icon: "♻️",
    columns: [{ key: "name_type_trash1", label: "Название типа", type: "text" }],
    toRequest: (row) => ({ nameTypeTrash1: S(row.name_type_trash1) }),
    createDefault: async () => ({ nameTypeTrash1: "Новый тип" }),
  },
  "level-trash": {
    apiPath: "/api/level-trash",
    idField: "id_level_trash",
    title: "Уровни отходов (LevelTrash)",
    sidebar: "Уровни отходов",
    icon: "📶",
    columns: [{ key: "name_level_trash", label: "Название уровня", type: "text" }],
    toRequest: (row) => ({ nameLevelTrash: S(row.name_level_trash) }),
    createDefault: async () => ({ nameLevelTrash: "Новый уровень" }),
  },
  "name-group": {
    apiPath: "/api/name-group",
    idField: "id_mame_group",
    title: "Наименования групп отходов (NameGroup)",
    sidebar: "Группы отходов",
    icon: "📛",
    columns: [{ key: "name_group", label: "Название группы", type: "text" }],
    toRequest: (row) => ({ nameGroup: S(row.name_group) }),
    createDefault: async () => ({ nameGroup: "Новая группа" }),
  },
  "physical-state": {
    apiPath: "/api/physical-state",
    idField: "id_state",
    title: "Физическое состояние (PhysicalState)",
    sidebar: "Физ. состояние",
    icon: "🧱",
    columns: [{ key: "state", label: "Состояние", type: "text" }],
    toRequest: (row) => ({ state: S(row.state) }),
    createDefault: async () => ({ state: "твёрдое" }),
  },
  region: {
    apiPath: "/api/region",
    idField: "id_region",
    title: "Регионы (Region)",
    sidebar: "Регионы",
    icon: "🗺️",
    columns: [{ key: "name_region", label: "Название региона", type: "text" }],
    toRequest: (row) => ({ nameRegion: S(row.name_region) }),
    createDefault: async () => ({ nameRegion: "Новый регион" }),
  },
  cities: {
    apiPath: "/api/cities",
    idField: "id_cities",
    title: "Города (Cities)",
    sidebar: "Города",
    icon: "🏙️",
    columns: [
      { key: "index", label: "Индекс", type: "text" },
      { key: "district", label: "Район", type: "text" },
      {
        key: "__region_name",
        label: "Регион",
        readOnly: true,
        format: (row) => {
          const reg = row.id_region;
          if (reg && typeof reg === "object")
            return S((reg as Record<string, unknown>).name_region);
          return "";
        },
      },
    ],
    toRequest: (row) => {
      const reg = row.id_region;
      let idRegion = 1;
      if (reg && typeof reg === "object")
        idRegion = Number((reg as Record<string, unknown>).id_region) || 1;
      return {
        idRegion,
        index: S(row.index),
        district: S(row.district),
      };
    },
    createDefault: async () => {
      const regions = await apiGet<Record<string, unknown>[]>("/api/region");
      const rid =
        regions[0] && typeof regions[0].id_region === "number"
          ? regions[0].id_region
          : 1;
      return { idRegion: rid, index: "000000", district: "Район" };
    },
  },
  "group-place-save": {
    apiPath: "/api/group-place-save",
    idField: "id_group_place_save",
    title: "Группы мест сохранения (GroupPlaceSave)",
    sidebar: "Группы мест",
    icon: "📦",
    columns: [{ key: "name_region", label: "Название", type: "text" }],
    toRequest: (row) => ({ nameRegion: S(row.name_region) }),
    createDefault: async () => ({ nameRegion: "Новая группа" }),
  },
  "storage-scheme": {
    apiPath: "/api/storage-scheme",
    idField: "id_storage_scheme",
    title: "Схемы хранения (StorageScheme)",
    sidebar: "Схемы хранения",
    icon: "🏗️",
    columns: [{ key: "name_storage_scheme", label: "Название схемы", type: "text" }],
    toRequest: (row) => ({ nameStorageScheme: S(row.name_storage_scheme) }),
    createDefault: async () => ({ nameStorageScheme: "Новая схема" }),
  },
  "gruops-degree": {
    apiPath: "/api/gruops-degree",
    idField: "id_gruops_degree",
    title: "Степени групп (GruopsDegree)",
    sidebar: "Степени групп",
    icon: "🔢",
    columns: [{ key: "namber_gruop", label: "Номер группы", type: "number" }],
    toRequest: (row) => ({ namberGruop: Number(row.namber_gruop ?? 0) }),
    createDefault: async () => ({ namberGruop: 1 }),
  },
  "comments-of-place": {
    apiPath: "/api/comments-of-place",
    idField: "id_comments_of_place",
    title: "Комментарии к объектам (CommentsOfPlace)",
    sidebar: "Комментарии",
    icon: "💬",
    columns: [{ key: "comments", label: "Текст", type: "text" }],
    toRequest: (row) => ({ comments: S(row.comments) }),
    createDefault: async () => ({ comments: "Новый комментарий" }),
  },
  "magazin-trash": {
    apiPath: "/api/magazin-trash",
    idField: "id_magazin_trash",
    title: "Справочник отходов (MagazinTrash)",
    sidebar: "Отходы (магазин)",
    icon: "🗑️",
    columns: [
      {
        key: "__cd",
        label: "Класс опасности (знач.)",
        readOnly: true,
        format: (row) => S((row.id_class_danger as Record<string, unknown>)?.class_danger),
      },
      { key: "id_class_danger", label: "ID класса опасности", type: "number" },
      {
        key: "__tt",
        label: "Тип отхода",
        readOnly: true,
        format: (row) => S((row.id_type_trash as Record<string, unknown>)?.name_type_trash1),
      },
      { key: "id_type_trash", label: "ID типа отхода (TypeTrash1)", type: "number" },
      {
        key: "__lv",
        label: "Уровень",
        readOnly: true,
        format: (row) => S((row.id_level_trash as Record<string, unknown>)?.name_level_trash),
      },
      { key: "id_level_trash", label: "ID уровня", type: "number" },
      {
        key: "__ng",
        label: "Группа наименований",
        readOnly: true,
        format: (row) => S((row.id_mame_group as Record<string, unknown>)?.name_group),
      },
      { key: "id_mame_group", label: "ID группы", type: "number" },
      { key: "code_trash", label: "Код", type: "text" },
      { key: "name_trash", label: "Наименование", type: "text" },
      { key: "level1", label: "Уровень 1", type: "number" },
      { key: "group2", label: "Группа 2", type: "number" },
      { key: "level3", label: "Уровень 3", type: "number" },
      { key: "level4", label: "Уровень 4", type: "text" },
    ],
    toRequest: (row) => ({
      idClassDanger: pickFk(row.id_class_danger, "id_class_danger"),
      idTypeTrash: pickFk(row.id_type_trash, "id_type_trash1"),
      idLevelTrash: pickFk(row.id_level_trash, "id_level_trash"),
      idMameGroup: pickFk(row.id_mame_group, "id_mame_group"),
      codeTrash: S(row.code_trash),
      nameTrash: S(row.name_trash),
      level1: Number(row.level1 ?? 0),
      group2: Number(row.group2 ?? 0),
      level3: Number(row.level3 ?? 0),
      level4: S(row.level4),
    }),
    createDefault: async () => {
      const [cd, tt, lv, ng] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/classDanger"),
        apiGet<Record<string, unknown>[]>("/api/type-trash1"),
        apiGet<Record<string, unknown>[]>("/api/level-trash"),
        apiGet<Record<string, unknown>[]>("/api/name-group"),
      ]);
      return {
        idClassDanger: pickFk(cd[0], "id_class_danger"),
        idTypeTrash: pickFk(tt[0], "id_type_trash1"),
        idLevelTrash: pickFk(lv[0], "id_level_trash"),
        idMameGroup: pickFk(ng[0], "id_mame_group"),
        codeTrash: `C${Date.now() % 1e8}`.slice(0, 8),
        nameTrash: "Новый отход",
        level1: 1,
        group2: 1,
        level3: 1,
        level4: "I",
      };
    },
  },
  "characteristic-trash": {
    apiPath: "/api/characteristic-trash",
    idField: "id_characteristic_trash",
    title: "Характеристики отходов на объекте (CharacteristicTrash)",
    sidebar: "Характеристики отходов",
    icon: "📊",
    columns: [
      {
        key: "__obj",
        label: "Объект",
        readOnly: true,
        format: (row) => S((row.id_object_place_trash as Record<string, unknown>)?.name_obj),
      },
      { key: "id_object_place_trash", label: "ID объекта", type: "number" },
      {
        key: "__mt",
        label: "Отход (справочник)",
        readOnly: true,
        format: (row) => S((row.id_magazin_trash as Record<string, unknown>)?.name_trash),
      },
      { key: "id_magazin_trash", label: "ID отхода", type: "number" },
      {
        key: "__st",
        label: "Физ. состояние",
        readOnly: true,
        format: (row) => S((row.id_state as Record<string, unknown>)?.state),
      },
      { key: "id_state", label: "ID состояния", type: "number" },
      { key: "weight_for_year", label: "Вес за год, т", type: "float" },
      { key: "square_for_year", label: "Объём/площадь за год", type: "float" },
    ],
    toRequest: (row) => ({
      idObjectPlaceTrash: pickFk(row.id_object_place_trash, "id_object_place_trash"),
      idMagazinTrash: pickFk(row.id_magazin_trash, "id_magazin_trash"),
      idState: pickFk(row.id_state, "id_state"),
      weightForYear: Number(row.weight_for_year ?? 0),
      squareForYear: Number(row.square_for_year ?? 0),
    }),
    createDefault: async () => {
      const [objs, mag, st] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/object-place-trash"),
        apiGet<Record<string, unknown>[]>("/api/magazin-trash"),
        apiGet<Record<string, unknown>[]>("/api/physical-state"),
      ]);
      return {
        idObjectPlaceTrash: pickFk(objs[0], "id_object_place_trash"),
        idMagazinTrash: pickFk(mag[0], "id_magazin_trash"),
        idState: pickFk(st[0], "id_state"),
        weightForYear: 0,
        squareForYear: 0,
      };
    },
  },
  "cleaner-builds": {
    apiPath: "/api/cleaner-builds",
    idField: "id_cleaner_build",
    title: "Очистные сооружения (CleanerBuilds)",
    sidebar: "Очистные",
    icon: "🛠️",
    columns: [
      { key: "registr_number", label: "Рег. номер", type: "text" },
      {
        key: "__obj",
        label: "Объект",
        readOnly: true,
        format: (row) => S((row.id_object_place_trash as Record<string, unknown>)?.name_obj),
      },
      { key: "id_object_place_trash", label: "ID объекта", type: "number" },
      { key: "name_object", label: "Название", type: "text" },
      { key: "start_use", label: "Год ввода", type: "number" },
      { key: "all_square", label: "Общая площадь", type: "float" },
      { key: "trash_count", label: "Объём отходов", type: "float" },
    ],
    toRequest: (row) => ({
      registrNumber: S(row.registr_number),
      idObjectPlaceTrash: pickFk(row.id_object_place_trash, "id_object_place_trash"),
      nameObject: S(row.name_object),
      startUse: Number(row.start_use ?? 0),
      allSquare: Number(row.all_square ?? 0),
      trashCount: Number(row.trash_count ?? 0),
    }),
    createDefault: async () => {
      const objs = await apiGet<Record<string, unknown>[]>("/api/object-place-trash");
      return {
        registrNumber: `CL-${Date.now() % 1e6}`,
        idObjectPlaceTrash: pickFk(objs[0], "id_object_place_trash"),
        nameObject: "Новое сооружение",
        startUse: new Date().getFullYear(),
        allSquare: 0,
        trashCount: 0,
      };
    },
  },
  "number-phone": {
    apiPath: "/api/number-phone",
    idField: "id_phone_number",
    title: "Телефоны (NumberPhone)",
    sidebar: "Телефоны",
    icon: "📞",
    columns: [
      { key: "number", label: "Номер", type: "text" },
      { key: "id_object_place_trash", label: "ID объекта размещения", type: "number" },
    ],
    toRequest: (row) => ({
      idObjectPlaceTrash: pickFk(row.id_object_place_trash, "id_object_place_trash"),
      number: S(row.number),
    }),
    createDefault: async () => {
      const objs = await apiGet<Record<string, unknown>[]>("/api/object-place-trash");
      return {
        idObjectPlaceTrash: pickFk(objs[0], "id_object_place_trash"),
        number: "+70000000000",
      };
    },
  },
};

export const GRID_SECTION_ORDER: GridSectionId[] = [
  "around-build",
  "natual-save-building",
  "classDanger",
  "type-trash1",
  "level-trash",
  "name-group",
  "physical-state",
  "region",
  "cities",
  "group-place-save",
  "storage-scheme",
  "gruops-degree",
  "comments-of-place",
  "magazin-trash",
  "characteristic-trash",
  "cleaner-builds",
  "number-phone",
];

export function isGridSection(id: SectionId): id is GridSectionId {
  return id !== "objects";
}

export function getGridDef(id: GridSectionId): GridSectionDef {
  return GRID_SECTIONS[id];
}
