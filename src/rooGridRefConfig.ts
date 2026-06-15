/**
 * Справочники для таблиц РОО (Eco_back_POO).
 */

export type RooGridRefKind =
  | "classDanger"
  | "district"
  | "region"
  | "cities"
  | "magazinTrash"
  | "physStateTrash"
  | "shortDiscribeTechnology"
  | "technology"
  | "magasinFactory"
  | "nameDropAirTrash"
  | "numberPhone";

export const ROO_GRID_REF_SPECS: Record<
  RooGridRefKind,
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
    apiPath: "/api/class-danger",
    idField: "id_class_danger",
    display: (r) => String(r.class_danger ?? ""),
    modalTitle: "Класс опасности",
    primaryHeader: "Класс",
    placeholder: "Число класса",
    quickCreateFromInput: (raw) => {
      const n = parseInt(raw.trim(), 10);
      if (Number.isNaN(n)) throw new Error("Введите целое число");
      return { classDanger: n };
    },
  },
  district: {
    apiPath: "/api/district",
    idField: "id_district",
    display: (r) => String(r.name_district ?? ""),
    modalTitle: "Район",
    primaryHeader: "Название района",
    placeholder: "Новый район",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите название");
      return { name_district: t };
    },
  },
  region: {
    apiPath: "/api/region",
    idField: "id_region",
    display: (r) => String(r.name_region ?? ""),
    modalTitle: "Область",
    primaryHeader: "Название области",
    placeholder: "Новая область",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите название");
      return { nameRegion: t };
    },
  },
  cities: {
    apiPath: "/api/cities",
    idField: "id_cities",
    nullable: true,
    display: (r) => String(r.name_cities ?? ""),
    modalTitle: "Город",
    primaryHeader: "Город",
    placeholder: "Создайте город в таблице «Города»",
    quickCreateFromInput: () => {
      throw new Error("Создайте город в таблице «Города»");
    },
  },
  magazinTrash: {
    apiPath: "/api/magazin-trash",
    idField: "id_magazin_trash",
    display: (r) =>
      `${String(r.code_trash ?? "").trim()} — ${String(r.name_trash ?? "").trim()}`.trim(),
    modalTitle: "Справочник отходов",
    primaryHeader: "Код — наименование",
    placeholder: "Создайте отход в таблице «Справочник отходов»",
    quickCreateFromInput: () => {
      throw new Error("Создайте отход в таблице «Справочник отходов»");
    },
  },
  physStateTrash: {
    apiPath: "/api/phys-state-trash",
    idField: "id_mame_group",
    display: (r) => String(r.name_group ?? ""),
    modalTitle: "Физическое состояние отхода",
    primaryHeader: "Состояние",
    placeholder: "Новое состояние",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите название");
      return { name_group: t };
    },
  },
  shortDiscribeTechnology: {
    apiPath: "/api/short-discribe-technology",
    idField: "id_short_discribe_technology",
    display: (r) => String(r.technology ?? ""),
    modalTitle: "Краткое описание технологии",
    primaryHeader: "Описание",
    placeholder: "Новое описание",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите описание");
      return { technology: t };
    },
  },
  technology: {
    apiPath: "/api/technology",
    idField: "id_technology",
    display: (r) => {
      const mag = r.id_magazin_trash as Record<string, unknown> | undefined;
      if (mag && typeof mag === "object") {
        return String(mag.name_trash ?? mag.code_trash ?? r.id_technology ?? "");
      }
      return String(r.id_technology ?? "");
    },
    modalTitle: "Технология",
    primaryHeader: "Технология",
    placeholder: "Создайте технологию в таблице «Технологии»",
    quickCreateFromInput: () => {
      throw new Error("Создайте технологию в таблице «Технологии»");
    },
  },
  magasinFactory: {
    apiPath: "/api/magasin-factory",
    idField: "id_magasin_factory",
    display: (r) =>
      `${String(r.id_registration ?? "").trim()} — ${String(r.name_obj ?? "").trim()}`.trim(),
    modalTitle: "Предприятие",
    primaryHeader: "Рег. номер — объект",
    placeholder: "Создайте предприятие в таблице «Предприятия»",
    quickCreateFromInput: () => {
      throw new Error("Создайте предприятие в таблице «Предприятия»");
    },
  },
  nameDropAirTrash: {
    apiPath: "/api/name-drop-air-trash",
    idField: "id_name_grope_air",
    display: (r) => String(r.name_drop_air_trash ?? ""),
    modalTitle: "Наименование выброса",
    primaryHeader: "Наименование",
    placeholder: "Новое наименование",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите наименование");
      return { name_drop_air_trash: t };
    },
  },
  numberPhone: {
    apiPath: "/api/number-phone",
    idField: "id_phone_number",
    nullable: true,
    display: (r) => String(r.number ?? ""),
    modalTitle: "Телефон",
    primaryHeader: "Номер",
    placeholder: "Новый номер",
    quickCreateFromInput: (raw) => {
      const t = raw.trim();
      if (!t) throw new Error("Введите номер");
      return { number: t, ur_ob: 0 };
    },
  },
};
