import { FK_CLEAR, apiGet, getNestedId } from "./api";
import { GRID_REF_SPECS, type GridRefKind } from "./gridRefConfig";

export type { GridRefKind } from "./gridRefConfig";

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
  /** Связь со справочником (таблица «Справочник отходов» и др.) */
  gridRef?: GridRefKind;
  /** В ячейке 0 показывать пусто (новая строка MagazinTrash) */
  emptyZero?: boolean;
};

export type GridSectionDef = {
  apiPath: string;
  idField: string;
  title: string;
  sidebar: string;
  columns: SimpleCol[];
  toRequest: (row: Record<string, unknown>) => Record<string, unknown>;
  createDefault: () => Promise<Record<string, unknown>>;
};

function S(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/** Невидимый заполнитель для @NotBlank в API (в таблице показываем как пусто). */
/** ID из числа в строке или из вложенного объекта сущности */
export function pickFk(val: unknown, nestedIdField: string): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  return getNestedId(val, nestedIdField) ?? 0;
}

function magazinIntField(row: Record<string, unknown>, key: string): number {
  const n = Number(row[key] ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/** Валидный id класса опасности или null → в теле запроса подставится FK_CLEAR (-1). */
function magazinClassDangerOrNull(row: Record<string, unknown>): number | null {
  const v = row.id_class_danger;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v > 0 ? v : null;
  const id = getNestedId(v, "id_class_danger");
  return id != null && id > 0 ? id : null;
}

/**
 * Тело MagazinTrash для API: jakarta @NotBlank / @Size / @NotNull.
 * Пустые ячейки после редактирования и NaN не должны давать 400.
 */
function magazinTrashApiBody(row: Record<string, unknown>): Record<string, unknown> {
  let code = S(row.code_trash).trim().slice(0, 8);
  if (!code) {
    const mid = row.id_magazin_trash;
    if (typeof mid === "number" && mid > 0) {
      code = String(mid).padStart(8, "0").slice(-8);
    } else {
      code = `C${Date.now() % 1e8}`.slice(0, 8);
    }
  }

  let name = S(row.name_trash).trim().slice(0, 50);
  if (!name) name = "Отход";

  let level4 = S(row.level4).trim();
  if (!level4) level4 = "I";

  return {
    /** null в JSON иногда режется прокси/клиентом; -1 = сброс FK (как ObjectPlaceTrash) */
    idClassDanger: (() => {
      const n = magazinClassDangerOrNull(row);
      return n == null ? FK_CLEAR : n;
    })(),
    idTypeTrash: pickFk(row.id_type_trash, "id_type_trash1"),
    idLevelTrash: pickFk(row.id_level_trash, "id_level_trash"),
    idMameGroup: pickFk(row.id_mame_group, "id_mame_group"),
    codeTrash: code,
    nameTrash: name,
    level1: magazinIntField(row, "level1"),
    group2: magazinIntField(row, "group2"),
    level3: magazinIntField(row, "level3"),
    level4,
  };
}

function cellStr(
  row: Record<string, unknown>,
  col: SimpleCol,
  gridRefCache?: Record<GridRefKind, Record<string, unknown>[]>
): string {
  if (col.format) return col.format(row);
  if (col.gridRef) {
    const spec = GRID_REF_SPECS[col.gridRef];
    const v =
      col.key === "__register"
        ? row.id_object_place_trash
        : col.key === "__code_trash" || col.key === "__name_trash"
          ? row.id_magazin_trash
          : col.key === "__class_danger"
            ? (row.id_magazin_trash as Record<string, unknown> | null | undefined)
                ?.id_class_danger
          : col.key === "__state"
            ? row.id_state
            : row[col.key];
    if (v && typeof v === "object") return spec.display(v as Record<string, unknown>);
    const id = typeof v === "number" ? v : getNestedId(v, spec.idField);
    if (id != null && gridRefCache) {
      const found = gridRefCache[col.gridRef].find((r) => pickFk(r, spec.idField) === id);
      if (found) return spec.display(found);
    }
    return id != null ? String(id) : "";
  }
  const v = row[col.key];
  if (col.type === "bool")
    return v === true ? "Да" : v === false ? "Нет" : "";
  return S(v);
}

export function gridCellValue(
  row: Record<string, unknown>,
  col: SimpleCol,
  gridRefCache?: Record<GridRefKind, Record<string, unknown>[]>
): string {
  return cellStr(row, col, gridRefCache);
}

export const OBJECT_SECTION = {
  title: "Объекты размещения отходов (ObjectPlaceTrash)",
  sidebar: "Объекты",
} as const;

export const GRID_SECTIONS: Record<GridSectionId, GridSectionDef> = {
  "around-build": {
    apiPath: "/api/around-build",
    idField: "id_around_build",
    title: "Здания вокруг объекта (AroundBuild)",
    sidebar: "Окр. здания",
    columns: [{ key: "name", label: "Название", type: "text" }],
    toRequest: (row) => ({ name: S(row.name) }),
    createDefault: async () => ({ name: "Новое здание" }),
  },
  "natual-save-building": {
    apiPath: "/api/natual-save-building",
    idField: "id_natual_save_build",
    title: "Здания природоохранного назначения (NatualSaveBuilding)",
    sidebar: "Природоохр. здания",
    columns: [{ key: "name", label: "Название", type: "text" }],
    toRequest: (row) => ({ name: S(row.name) }),
    createDefault: async () => ({ name: "Новое здание" }),
  },
  classDanger: {
    apiPath: "/api/classDanger",
    idField: "id_class_danger",
    title: "Классы опасности (ClassDanger)",
    sidebar: "Класс опасности",
    columns: [{ key: "class_danger", label: "Класс (число)", type: "number" }],
    toRequest: (row) => ({ classDanger: Number(row.class_danger ?? 0) }),
    createDefault: async () => ({ classDanger: 1 }),
  },
  "type-trash1": {
    apiPath: "/api/type-trash1",
    idField: "id_type_trash1",
    title: "Типы отходов (TypeTrash1)",
    sidebar: "Типы отходов",
    columns: [{ key: "name_type_trash1", label: "Название типа", type: "text" }],
    toRequest: (row) => ({ nameTypeTrash1: S(row.name_type_trash1) }),
    createDefault: async () => ({ nameTypeTrash1: "Новый тип" }),
  },
  "level-trash": {
    apiPath: "/api/level-trash",
    idField: "id_level_trash",
    title: "Уровни отходов (LevelTrash)",
    sidebar: "Уровни отходов",
    columns: [{ key: "name_level_trash", label: "Название уровня", type: "text" }],
    toRequest: (row) => ({ nameLevelTrash: S(row.name_level_trash) }),
    createDefault: async () => ({ nameLevelTrash: "Новый уровень" }),
  },
  "name-group": {
    apiPath: "/api/name-group",
    idField: "id_mame_group",
    title: "Наименования групп отходов (NameGroup)",
    sidebar: "Группы отходов",
    columns: [{ key: "name_group", label: "Название группы", type: "text" }],
    toRequest: (row) => ({ nameGroup: S(row.name_group) }),
    createDefault: async () => ({ nameGroup: "Новая группа" }),
  },
  "physical-state": {
    apiPath: "/api/physical-state",
    idField: "id_state",
    title: "Физическое состояние (PhysicalState)",
    sidebar: "Физ. состояние",
    columns: [{ key: "state", label: "Состояние", type: "text" }],
    toRequest: (row) => ({ state: S(row.state) }),
    createDefault: async () => ({ state: "твёрдое" }),
  },
  region: {
    apiPath: "/api/region",
    idField: "id_region",
    title: "Регионы (Region)",
    sidebar: "Регионы",
    columns: [{ key: "name_region", label: "Название региона", type: "text" }],
    toRequest: (row) => ({ nameRegion: S(row.name_region) }),
    createDefault: async () => ({ nameRegion: "Новый регион" }),
  },
  cities: {
    apiPath: "/api/cities",
    idField: "id_cities",
    title: "Города (Cities)",
    sidebar: "Города",
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
    columns: [{ key: "name_region", label: "Название", type: "text" }],
    toRequest: (row) => ({ nameRegion: S(row.name_region) }),
    createDefault: async () => ({ nameRegion: "Новая группа" }),
  },
  "storage-scheme": {
    apiPath: "/api/storage-scheme",
    idField: "id_storage_scheme",
    title: "Схемы хранения (StorageScheme)",
    sidebar: "Схемы хранения",
    columns: [{ key: "name_storage_scheme", label: "Название схемы", type: "text" }],
    toRequest: (row) => ({ nameStorageScheme: S(row.name_storage_scheme) }),
    createDefault: async () => ({ nameStorageScheme: "Новая схема" }),
  },
  "gruops-degree": {
    apiPath: "/api/gruops-degree",
    idField: "id_gruops_degree",
    title: "Степени групп (GruopsDegree)",
    sidebar: "Степени групп",
    columns: [{ key: "namber_gruop", label: "Номер группы", type: "number" }],
    toRequest: (row) => ({ namberGruop: Number(row.namber_gruop ?? 0) }),
    createDefault: async () => ({ namberGruop: 1 }),
  },
  "comments-of-place": {
    apiPath: "/api/comments-of-place",
    idField: "id_comments_of_place",
    title: "Комментарии к объектам (CommentsOfPlace)",
    sidebar: "Комментарии",
    columns: [{ key: "comments", label: "Текст", type: "text" }],
    toRequest: (row) => ({ comments: S(row.comments) }),
    createDefault: async () => ({ comments: "Новый комментарий" }),
  },
  "magazin-trash": {
    apiPath: "/api/magazin-trash",
    idField: "id_magazin_trash",
    title: "Справочник отходов (MagazinTrash)",
    sidebar: "Справочник отходов",
    columns: [
      { key: "code_trash", label: "Код отхода", type: "text" },
      { key: "name_trash", label: "Наименование отхода", type: "text" },
      { key: "id_class_danger", label: "Класс опасности", gridRef: "classDanger" },
      { key: "id_type_trash", label: "Тип отхода", gridRef: "typeTrash1" },
      { key: "id_level_trash", label: "Уровень", gridRef: "levelTrash" },
      { key: "id_mame_group", label: "Группа наименований", gridRef: "nameGroup" },
      { key: "level1", label: "Уровень 1", type: "number" },
      { key: "group2", label: "Группа 2", type: "number" },
      { key: "level3", label: "Уровень 3", type: "number" },
      { key: "level4", label: "Уровень 4", type: "text" },
    ],
    toRequest: (row) => magazinTrashApiBody(row),
    createDefault: async () => {
      const [tt, lv, ng] = await Promise.all([
        apiGet<Record<string, unknown>[]>("/api/type-trash1"),
        apiGet<Record<string, unknown>[]>("/api/level-trash"),
        apiGet<Record<string, unknown>[]>("/api/name-group"),
      ]);
      if (!tt?.length || !lv?.length || !ng?.length) {
        throw new Error(
          "Сначала добавьте записи в справочники: «Типы отходов», «Уровни отходов», «Группы отходов»."
        );
      }
      return {
        idClassDanger: FK_CLEAR,
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
    columns: [
      {
        key: "__register",
        label: "Рег. номер",
        gridRef: "objectPlaceTrash",
      },
      {
        key: "__code_trash",
        label: "Код отхода",
        gridRef: "magazinTrashCode",
      },
      {
        key: "__name_trash",
        label: "Наименование отхода",
        gridRef: "magazinTrashName",
      },
      {
        key: "__state",
        label: "Физическое состояние",
        gridRef: "physicalState",
      },
      {
        key: "__class_danger",
        label: "Класс опасности",
        gridRef: "classDanger",
      },
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
  "characteristic-trash",
  "magazin-trash",
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
  "cleaner-builds",
  "number-phone",
];

export function isGridSection(id: SectionId): id is GridSectionId {
  return id !== "objects";
}

export function getGridDef(id: GridSectionId): GridSectionDef {
  return GRID_SECTIONS[id];
}
