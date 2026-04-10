/**
 * Колонки главной таблицы ObjectPlaceTrash.
 * Порядок и русские названия синхронизированы с документом
 * "date/отношения таблицы и порядок.xlsx" (строка названий + строка JSON-полей).
 */

export type RefKind =
  | "cities"
  | "group"
  | "storage"
  | "degree"
  | "comments"
  | "magazin";

export type ObjectCol = {
  key: string;
  label: string;
  ref?: RefKind;
  editable?: boolean;
  type?: "text" | "number" | "date" | "bool" | "float";
  /** Многострочное поле: textarea с авто-высотой при вводе */
  multiline?: boolean;
};

export const OBJECT_COLUMNS: ObjectCol[] = [
  { key: "id_registration", label: "Код регистрации", editable: true },
  { key: "register", label: "Реестровый номер", editable: true, type: "number" },
  { key: "__code_trash", label: "Код отхода", ref: "magazin" },
  { key: "__name_trash", label: "Наименование отхода", ref: "magazin" },
  { key: "date_register", label: "Дата регистрации", editable: true, type: "date" },
  { key: "__region", label: "Область", ref: "group" },
  { key: "name_obj", label: "Наименование объекта", editable: true, multiline: true },
  { key: "name_own", label: "Наименование собственника", editable: true, multiline: true },
  { key: "start_use", label: "Начало эксплуатации", editable: true, type: "number" },
  { key: "servise_life", label: "Проектный срок эксплуатации", editable: true, multiline: true },
  { key: "__group", label: "Наименование группы", ref: "group" },
  { key: "company_located", label: "Юридический адрес собственника", editable: true, multiline: true },
  { key: "__phones", label: "Телефон", editable: false },
  { key: "__city", label: "Район", ref: "cities" },
  { key: "place_obj", label: "Местонахождение объекта", editable: true, multiline: true },
  { key: "project", label: "Проект", editable: true, multiline: true },
  { key: "state_expertize", label: "Заключение гос экоэкспертизы по приемке объекта", editable: true, type: "bool" },
  { key: "eco_pasport", label: "Экологический паспорт", editable: true, multiline: true },
  { key: "prava_place", label: "Основание прав на участок", editable: true, multiline: true },
  { key: "confirmation_use", label: "Документация подтверждения ввода в эксплуатацию", editable: true, type: "bool" },
  { key: "square", label: "Общая площадь, га", editable: true, type: "float" },
  { key: "use_square", label: "Для размещения, га", editable: true, type: "float" },
  { key: "trash_square", label: "Занятая отходами, га", editable: true, type: "float" },
  { key: "project_power", label: "Мощность объекта, тыс т/год", editable: true, multiline: true },
  { key: "facticheskay_power", label: "Фактическая мощность объекта", editable: true, multiline: true },
  { key: "__storage", label: "Схема складирования отходов", ref: "storage" },
  { key: "accomulated_trash", label: "Количество накопленных отходов", editable: true, multiline: true },
  { key: "type_grounds", label: "Состав грунтов", editable: true, multiline: true },
  { key: "ander_water", label: "Уровень подземных вод, м", editable: true, multiline: true },
  { key: "observation_hole", label: "Наблюдательная скважина", editable: true, multiline: true },
  { key: "__around", label: "Природоохранные сооружения", editable: false },
  { key: "__natural", label: "Населенные пункты", editable: false },
  { key: "__degree", label: "Группы", ref: "degree" },
  { key: "__comments", label: "Примечания", ref: "comments" },
  { key: "date_axclute", label: "Дата исключения из реестра", editable: true, type: "date" },
  { key: "reson_axclute", label: "Основание", editable: true, multiline: true },
  { key: "status", label: "Исключен", editable: true, type: "bool" },
];
