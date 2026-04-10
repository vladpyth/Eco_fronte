/**
 * Связанные справочники для полей MagazinTrash (таблица «Справочник отходов»).
 * Порядок колонок в UI — см. `data/date/1-columns-order.txt` (должен совпадать с `date/1.xlsx`).
 */

export type GridRefKind = "classDanger" | "typeTrash1" | "levelTrash" | "nameGroup";

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
};
