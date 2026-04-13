/**
 * Связанные справочники для полей MagazinTrash (таблица «Справочник отходов»).
 * Порядок колонок в UI — см. `data/date/1-columns-order.txt` (должен совпадать с `date/1.xlsx`).
 */

export type GridRefKind =
  | "classDanger"
  | "typeTrash1"
  | "levelTrash"
  | "nameGroup"
  | "objectPlaceTrash"
  | "magazinTrashCode"
  | "magazinTrashName"
  | "physicalState";

export const GRID_REF_SPECS: Record<
  GridRefKind,
  {
    apiPath: string;
    idField: string;
    nullable?: boolean;
    display: (r: Record<string, unknown>) => string;
    modalTitle: string;
    primaryHeader: string;
    placeholder: string;
    quickCreateFromInput: (raw: string) => Record<string, unknown>;
  }
> = {
  classDanger: {
    apiPath: "/api/classDanger",
    idField: "id_class_danger",
    /** Разрешить null в MagazinTrash.id_class_danger */
    nullable: true,
    display: (r) => String(r.class_danger ?? ""),
    modalTitle: "Класс опасности",
    primaryHeader: "Класс",
    placeholder: "Новый класс (число)",
    quickCreateFromInput: (raw) => {
      const n = parseInt(raw.trim(), 10);
      if (Number.isNaN(n)) throw new Error("Введите целое число");
      return { classDanger: n };
    },
  },
  typeTrash1: {
    apiPath: "/api/type-trash1",
    idField: "id_type_trash1",
    display: (r) => String(r.name_type_trash1 ?? ""),
    modalTitle: "Тип отхода",
    primaryHeader: "Название типа",
    placeholder: "Новый тип отхода",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите название");
      return { nameTypeTrash1: t };
    },
  },
  levelTrash: {
    apiPath: "/api/level-trash",
    idField: "id_level_trash",
    display: (r) => String(r.name_level_trash ?? ""),
    modalTitle: "Уровень отходов",
    primaryHeader: "Название уровня",
    placeholder: "Новый уровень",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите название");
      return { nameLevelTrash: t };
    },
  },
  nameGroup: {
    apiPath: "/api/name-group",
    idField: "id_mame_group",
    display: (r) => String(r.name_group ?? ""),
    modalTitle: "Группа наименований",
    primaryHeader: "Название группы",
    placeholder: "Новая группа",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите название");
      return { nameGroup: t };
    },
  },
  objectPlaceTrash: {
    apiPath: "/api/object-place-trash",
    idField: "id_object_place_trash",
    display: (r) => String(r.register ?? ""),
    modalTitle: "Объект размещения",
    primaryHeader: "Рег. номер",
    placeholder: "Создание объекта здесь отключено",
    quickCreateFromInput: () => {
      throw new Error("Создайте объект в таблице «Объекты»");
    },
  },
  magazinTrashCode: {
    apiPath: "/api/magazin-trash",
    idField: "id_magazin_trash",
    display: (r) => String(r.code_trash ?? ""),
    modalTitle: "Справочник отходов",
    primaryHeader: "Код отхода",
    placeholder: "Создание отхода здесь отключено",
    quickCreateFromInput: () => {
      throw new Error("Создайте отход в таблице «Справочник отходов»");
    },
  },
  magazinTrashName: {
    apiPath: "/api/magazin-trash",
    idField: "id_magazin_trash",
    display: (r) => String(r.name_trash ?? ""),
    modalTitle: "Справочник отходов",
    primaryHeader: "Наименование",
    placeholder: "Создание отхода здесь отключено",
    quickCreateFromInput: () => {
      throw new Error("Создайте отход в таблице «Справочник отходов»");
    },
  },
  physicalState: {
    apiPath: "/api/physical-state",
    idField: "id_state",
    display: (r) => String(r.state ?? ""),
    modalTitle: "Физическое состояние",
    primaryHeader: "Состояние",
    placeholder: "Новое состояние",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите состояние");
      return { state: t };
    },
  },
};
