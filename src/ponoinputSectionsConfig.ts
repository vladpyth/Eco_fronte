import {
  ROO_SECTIONS,
  ROO_SECTION_ORDER,
  rooCellValue,
  pickFk,
  type RooCol,
  type RooSectionDef,
  type RooSectionId,
} from "./rooSectionsConfig";

function S(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
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

const GET_SPOT_COLS: RooCol[] = [
  { key: "get", label: "Получение", type: "bool" },
  { key: "spot", label: "Место", type: "text", multiline: true },
];

const MAGASIN_FACTORY_EXTRA_COLS: RooCol[] = [
  { key: "facticheskay_power", label: "Фактическая мощность", type: "text", multiline: true },
  {
    key: "id_technology",
    label: "Технология",
    gridRef: "technology",
    gridRefDisplay: (r) => {
      const trash = r.id_magazin_trash;
      if (trash && typeof trash === "object") return S((trash as Record<string, unknown>).name_trash);
      return S(r.id_technology);
    },
  },
  { key: "new_base", label: "Новая база", type: "bool" },
  { key: "date_approve_tech", label: "Дата утверждения технологии", type: "text", multiline: true },
  { key: "date_input_update", label: "Дата внесения/обновления", type: "text", multiline: true },
  { key: "admissions_by_region", label: "Допуски по регионам", type: "text", multiline: true },
  { key: "services", label: "Услуги", type: "text", multiline: true },
  { key: "note_services", label: "Примечание к услугам", type: "text", multiline: true },
  { key: "mobile_unit", label: "Мобильная установка", type: "bool" },
  { key: "excluded", label: "Исключён", type: "bool" },
  { key: "date_excluded", label: "Дата исключения", type: "date" },
  { key: "note_excluded", label: "Примечание к исключению", type: "text", multiline: true },
  { key: "burning", label: "Сжигание", type: "bool" },
];

function magasinFactoryToRequest(row: Record<string, unknown>): Record<string, unknown> {
  const base = ROO_SECTIONS["magasin-factory"].toRequest(row);
  return {
    ...base,
    new_base: optBool(row, "new_base"),
    date_approve_tech: optStr(row, "date_approve_tech"),
    date_input_update: optStr(row, "date_input_update"),
    admissions_by_region: optStr(row, "admissions_by_region"),
    services: optStr(row, "services"),
    note_services: optStr(row, "note_services"),
    mobile_unit: optBool(row, "mobile_unit"),
    excluded: optBool(row, "excluded"),
    date_excluded: optDate(row, "date_excluded"),
    note_excluded: optStr(row, "note_excluded"),
    burning: optBool(row, "burning"),
  };
}

function withGetSpotToRequest(
  base: (row: Record<string, unknown>) => Record<string, unknown>
): (row: Record<string, unknown>) => Record<string, unknown> {
  return (row) => ({
    ...base(row),
    get: optBool(row, "get"),
    spot: optStr(row, "spot"),
  });
}

export const PONOINPUT_SECTIONS: Record<RooSectionId, RooSectionDef> = {
  ...ROO_SECTIONS,
  "magasin-factory": {
    ...ROO_SECTIONS["magasin-factory"],
    columns: [...ROO_SECTIONS["magasin-factory"].columns, ...MAGASIN_FACTORY_EXTRA_COLS],
    toRequest: magasinFactoryToRequest,
  },
  "my-trash": {
    ...ROO_SECTIONS["my-trash"],
    columns: [...ROO_SECTIONS["my-trash"].columns, ...GET_SPOT_COLS],
    toRequest: withGetSpotToRequest(ROO_SECTIONS["my-trash"].toRequest),
  },
  technology: {
    ...ROO_SECTIONS.technology,
    columns: [...ROO_SECTIONS.technology.columns, ...GET_SPOT_COLS],
    toRequest: withGetSpotToRequest(ROO_SECTIONS.technology.toRequest),
  },
};

export const PONOINPUT_SECTION_ORDER: RooSectionId[] = ROO_SECTION_ORDER;

export function getPonoinputSection(id: RooSectionId): RooSectionDef {
  return PONOINPUT_SECTIONS[id];
}

export { rooCellValue };
