import { apiDelete, apiGet, apiPost, apiPut, getNestedId } from "./api";
import { pickFk } from "./rooSectionsConfig";
import type { HubDropAir, HubFactoryBundle, HubMyTrash, HubPhone, HubTechnology } from "./roioFactoryHubOverlay";

export type HubBaselineIds = {
  phoneIds: number[];
  techIds: number[];
  dropIds: number[];
  trashIds: number[];
};

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
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error(`Некорректная дата в поле «${key}» (нужен формат ГГГГ-ММ-ДД)`);
}

function optBool(row: Record<string, unknown>, key: string): boolean | undefined {
  const v = row[key];
  if (v === null || v === undefined) return undefined;
  return Boolean(v);
}

function fkId(val: unknown, ...idFields: string[]): number {
  for (const f of idFields) {
    const id = pickFk(val, f);
    if (id > 0) return id;
  }
  if (typeof val === "number" && val > 0) return val;
  return 0;
}

function isTempId(id: number | undefined | null): boolean {
  return typeof id === "number" && id < 0;
}

export function baselineFromBundle(bundle: HubFactoryBundle): HubBaselineIds {
  return {
    phoneIds: bundle.phones.map((p) => p.id_phone_number).filter((id): id is number => typeof id === "number" && id > 0),
    techIds: bundle.technologies.map((t) => t.id_technology).filter((id): id is number => typeof id === "number" && id > 0),
    dropIds: bundle.dropAirs.map((d) => d.id_drop_air).filter((id): id is number => typeof id === "number" && id > 0),
    trashIds: bundle.myTrashes.map((t) => t.id_my_trash).filter((id): id is number => typeof id === "number" && id > 0),
  };
}

/** Собирает тело MagasinFactoryRequest; пустые обязательные поля — ошибка (без автозаполнения). */
export function factoryToRequest(row: Record<string, unknown>): Record<string, unknown> {
  const id_registration = S(row.id_registration).trim().slice(0, 10);
  if (!id_registration) throw new Error("Укажите регистрационный номер");

  const name_obj = S(row.name_obj).trim();
  if (!name_obj) throw new Error("Укажите наименование объекта");

  const name_own = S(row.name_own).trim();
  if (!name_own) throw new Error("Укажите наименование собственника");

  const address_own = S(row.address_own).trim();
  if (!address_own) throw new Error("Укажите адрес собственника");

  const address_obj = S(row.address_obj).trim();
  if (!address_obj) throw new Error("Укажите адрес объекта");

  const citiesId = fkId(row.id_cities, "id_cities");
  const shortId = fkId(row.id_short_discribe_technology, "id_short_discribe_technology");
  const techId = fkId(row.id_technology, "id_technology");

  const ynp = (optStr(row, "YNP") ?? optStr(row, "ynp") ?? "").trim();
  if (ynp && ynp.length > 12) {
    throw new Error("УНП максимум 12 символов");
  }

  const body: Record<string, unknown> = {
    id_registration,
    name_obj,
    name_own,
    address_own,
    address_obj,
    value: Number.isFinite(Number(row.value)) ? Number(row.value) : 0,
  };

  const date_register = optDate(row, "date_register");
  if (date_register) body.date_register = date_register;
  const date_approve = optDate(row, "date_approve");
  if (date_approve) body.date_approve = date_approve;

  if (citiesId > 0) body.id_cities = citiesId;
  if (shortId > 0) body.id_short_discribe_technology = shortId;
  if (techId > 0) body.id_technology = techId;

  const develop_organization = optStr(row, "develop_organization");
  if (develop_organization) body.develop_organization = develop_organization;
  const confirmed_project = optStr(row, "confirmed_project");
  if (confirmed_project) body.confirmed_project = confirmed_project;
  const act_use = optStr(row, "act_use");
  if (act_use) body.act_use = act_use;
  const requirements_acts = optStr(row, "requirements_acts");
  if (requirements_acts) body.requirements_acts = requirements_acts;
  const character_prod = optStr(row, "character_prod");
  if (character_prod) body.character_prod = character_prod;
  const project_power_yer = optStr(row, "project_power_yer");
  if (project_power_yer) body.project_power_yer = project_power_yer;
  const project_power_hr = optStr(row, "project_power_hr");
  if (project_power_hr) body.project_power_hr = project_power_hr;
  const facticheskay_power = optStr(row, "facticheskay_power");
  if (facticheskay_power) body.facticheskay_power = facticheskay_power;
  if (ynp) body.YNP = ynp;

  const conclusion_documentation = optBool(row, "conclusion_documentation");
  if (conclusion_documentation !== undefined) body.conclusion_documentation = conclusion_documentation;
  const obj_use_trash = optBool(row, "obj_use_trash");
  if (obj_use_trash !== undefined) body.obj_use_trash = obj_use_trash;
  const obj_accept_trash = optBool(row, "obj_accept_trash");
  if (obj_accept_trash !== undefined) body.obj_accept_trash = obj_accept_trash;

  return body;
}

/** Доп. поля паспорта для модуля «РОИО для внесения». */
export function appendPonoinputFactoryFields(
  body: Record<string, unknown>,
  row: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...body };
  const facticheskay_power = optStr(row, "facticheskay_power");
  if (facticheskay_power) out.facticheskay_power = facticheskay_power;

  for (const key of [
    "date_approve_tech",
    "date_input_update",
    "admissions_by_region",
    "services",
    "note_services",
    "note_excluded",
  ] as const) {
    const v = optStr(row, key);
    if (v) out[key] = v;
  }

  for (const key of ["new_base", "mobile_unit", "excluded", "burning"] as const) {
    const v = optBool(row, key);
    if (v !== undefined) out[key] = v;
  }

  const date_excluded = optDate(row, "date_excluded");
  if (date_excluded) out.date_excluded = date_excluded;

  return out;
}

async function ensureShortTechId(val: unknown): Promise<number | undefined> {
  const id = fkId(val, "id_short_discribe_technology");
  if (id > 0) return id;
  if (!isTempId(id) && id !== 0) return undefined;
  const label = val && typeof val === "object" ? S((val as Record<string, unknown>).technology).trim() : "";
  if (!label) return undefined;
  const created = await apiPost<Record<string, unknown>>("/api/short-discribe-technology", { technology: label });
  const newId = getNestedId(created, "id_short_discribe_technology");
  return typeof newId === "number" && newId > 0 ? newId : undefined;
}

async function ensureClassDangerId(val: unknown): Promise<number> {
  const id = fkId(val, "id_class_danger");
  if (id > 0) return id;
  const raw =
    val && typeof val === "object"
      ? Number((val as Record<string, unknown>).class_danger ?? (val as Record<string, unknown>).classDanger)
      : Number(val);
  if (!Number.isFinite(raw)) throw new Error("Укажите класс опасности");
  const created = await apiPost<Record<string, unknown>>("/api/class-danger", { classDanger: raw });
  const newId = getNestedId(created, "id_class_danger");
  if (typeof newId !== "number" || newId <= 0) throw new Error("Не удалось создать класс опасности");
  return newId;
}

async function ensureMagazinTrashId(val: unknown, classDangerId?: number): Promise<number> {
  const id = fkId(val, "id_magazin_trash");
  if (id > 0) return id;
  const name = val && typeof val === "object" ? S((val as Record<string, unknown>).name_trash).trim() : "";
  if (!name) throw new Error("Укажите отход");
  const cd =
    classDangerId ??
    (val && typeof val === "object" ? fkId((val as Record<string, unknown>).id_class_danger, "id_class_danger") : 0);
  if (cd <= 0) throw new Error("Для нового отхода нужен класс опасности");
  const created = await apiPost<Record<string, unknown>>("/api/magazin-trash", {
    id_class_danger: cd,
    code_trash: 10000000 + (Date.now() % 89999999),
    name_trash: name,
  });
  const newId = getNestedId(created, "id_magazin_trash");
  if (typeof newId !== "number" || newId <= 0) throw new Error("Не удалось создать отход");
  return newId;
}

async function ensurePhysStateId(val: unknown): Promise<number> {
  const id = fkId(val, "id_mame_group", "id_phys_trash");
  if (id > 0) return id;
  const name = val && typeof val === "object" ? S((val as Record<string, unknown>).name_group).trim() : "";
  if (!name) throw new Error("Укажите физическое состояние");
  const created = await apiPost<Record<string, unknown>>("/api/phys-state-trash", { name_group: name });
  const newId = getNestedId(created, "id_mame_group");
  if (typeof newId !== "number" || newId <= 0) throw new Error("Не удалось создать физ. состояние");
  return newId;
}

async function ensureNameDropAirId(val: unknown): Promise<number> {
  const id = fkId(val, "id_name_grope_air");
  if (id > 0) return id;
  const name = val && typeof val === "object" ? S((val as Record<string, unknown>).name_drop_air_trash).trim() : "";
  if (!name) throw new Error("Укажите наименование выброса");
  const created = await apiPost<Record<string, unknown>>("/api/name-drop-air-trash", {
    name_drop_air_trash: name,
  });
  const newId = getNestedId(created, "id_name_grope_air");
  if (typeof newId !== "number" || newId <= 0) throw new Error("Не удалось создать наименование выброса");
  return newId;
}

async function syncPhones(factoryId: number, phones: HubPhone[], baseline: HubBaselineIds): Promise<void> {
  const keep = new Set<number>();
  for (const ph of phones) {
    const number = S(ph.number).trim();
    if (!number && ph.ur_ob == null) continue;
    if (!number) throw new Error("У телефона не указан номер");
    if (ph.ur_ob !== 0 && ph.ur_ob !== 1) throw new Error("Укажите тип телефона (Собственник / Объект)");

    if (typeof ph.id_phone_number === "number" && ph.id_phone_number > 0) {
      keep.add(ph.id_phone_number);
      await apiPut(`/api/number-phone/${ph.id_phone_number}`, { number });
      try {
        await apiDelete(
          `/api/number-phone-count/unlink?objectPlaceId=${factoryId}&phoneId=${ph.id_phone_number}`
        );
      } catch {
        /* связи могло не быть */
      }
      await apiPost(
        `/api/number-phone-count?objectPlaceId=${factoryId}&phoneId=${ph.id_phone_number}&urOb=${ph.ur_ob}`,
        {}
      );
    } else {
      const created = await apiPost<Record<string, unknown>>("/api/number-phone", {
        idObjectPlaceTrash: factoryId,
        number,
        ur_ob: ph.ur_ob,
      });
      const newId = getNestedId(created, "id_phone_number");
      if (typeof newId === "number" && newId > 0) keep.add(newId);
    }
  }

  for (const id of baseline.phoneIds) {
    if (keep.has(id)) continue;
    try {
      await apiDelete(`/api/number-phone-count/unlink?objectPlaceId=${factoryId}&phoneId=${id}`);
    } catch {
      /* ignore */
    }
  }
}

async function syncTechnologies(
  factoryId: number,
  rows: HubTechnology[],
  baseline: HubBaselineIds
): Promise<void> {
  const keep = new Set<number>();
  for (const row of rows) {
    if (row.id_class_danger == null && row.id_magazin_trash == null && row.id_phys_trash == null) continue;
    if (row.id_class_danger == null || row.id_magazin_trash == null || row.id_phys_trash == null) {
      throw new Error("В технологии заполните класс опасности, отход и физ. состояние");
    }

    const id_class_danger = await ensureClassDangerId(row.id_class_danger);
    const id_magazin_trash = await ensureMagazinTrashId(row.id_magazin_trash, id_class_danger);
    const id_phys_trash = await ensurePhysStateId(row.id_phys_trash);
    const body: Record<string, unknown> = {
      id_class_danger,
      id_magazin_trash,
      id_phys_trash,
      id_magasin_factory: factoryId,
    };
    if (row.get !== undefined && row.get !== null) body.get = Boolean(row.get);
    if (row.spot != null && String(row.spot).trim()) body.spot = String(row.spot).trim();

    if (typeof row.id_technology === "number" && row.id_technology > 0) {
      keep.add(row.id_technology);
      await apiPut(`/api/technology/${row.id_technology}`, body);
    } else {
      const created = await apiPost<Record<string, unknown>>("/api/technology", body);
      const newId = getNestedId(created, "id_technology");
      if (typeof newId === "number" && newId > 0) keep.add(newId);
    }
  }

  for (const id of baseline.techIds) {
    if (!keep.has(id)) await apiDelete(`/api/technology/${id}`);
  }
}

async function syncDropAirs(factoryId: number, rows: HubDropAir[], baseline: HubBaselineIds): Promise<void> {
  const keep = new Set<number>();
  for (const row of rows) {
    const hasAny =
      row.id_class_danger != null || row.id_name_grope_air != null || Number(row.value_drop_trash) > 0;
    if (!hasAny) continue;

    const id_class_danger = await ensureClassDangerId(row.id_class_danger);
    const id_name_grope_air = await ensureNameDropAirId(row.id_name_grope_air);
    const value_drop_trash = Number(row.value_drop_trash ?? 0);
    if (!(value_drop_trash > 0)) throw new Error("Значение выброса должно быть больше 0");

    const body = {
      id_class_danger,
      id_name_grope_air,
      id_magasin_factory: factoryId,
      value_drop_trash,
    };

    if (typeof row.id_drop_air === "number" && row.id_drop_air > 0) {
      keep.add(row.id_drop_air);
      await apiPut(`/api/drop-air/${row.id_drop_air}`, body);
    } else {
      const created = await apiPost<Record<string, unknown>>("/api/drop-air", body);
      const newId = getNestedId(created, "id_drop_air");
      if (typeof newId === "number" && newId > 0) keep.add(newId);
    }
  }

  for (const id of baseline.dropIds) {
    if (!keep.has(id)) await apiDelete(`/api/drop-air/${id}`);
  }
}

async function syncMyTrashes(factoryId: number, rows: HubMyTrash[], baseline: HubBaselineIds): Promise<void> {
  const keep = new Set<number>();
  for (const row of rows) {
    const hasAny =
      row.id_class_danger != null || row.id_magazin_trash != null || Number(row.value_trash) > 0;
    if (!hasAny) continue;

    const id_class_danger = await ensureClassDangerId(row.id_class_danger);
    const id_magazin_trash = await ensureMagazinTrashId(row.id_magazin_trash, id_class_danger);
    const value_trash = Number(row.value_trash ?? 0);
    if (!(value_trash > 0)) throw new Error("Количество отхода должно быть больше 0");

    const body: Record<string, unknown> = {
      id_class_danger,
      id_magazin_trash,
      id_magasin_factory: factoryId,
      value_trash,
    };
    if (row.get !== undefined && row.get !== null) body.get = Boolean(row.get);
    if (row.spot != null && String(row.spot).trim()) body.spot = String(row.spot).trim();

    if (typeof row.id_my_trash === "number" && row.id_my_trash > 0) {
      keep.add(row.id_my_trash);
      await apiPut(`/api/my-trash/${row.id_my_trash}`, body);
    } else {
      const created = await apiPost<Record<string, unknown>>("/api/my-trash", body);
      const newId = getNestedId(created, "id_my_trash");
      if (typeof newId === "number" && newId > 0) keep.add(newId);
    }
  }

  for (const id of baseline.trashIds) {
    if (!keep.has(id)) await apiDelete(`/api/my-trash/${id}`);
  }
}

export async function saveFactoryBundle(
  mode: "create" | "edit",
  bundle: HubFactoryBundle,
  baseline: HubBaselineIds,
  opts?: { ponoinputExtras?: boolean }
): Promise<number> {
  const factory = { ...bundle.factory };

  const shortId = await ensureShortTechId(factory.id_short_discribe_technology);
  if (shortId != null) {
    factory.id_short_discribe_technology = shortId;
  } else if (isTempId(fkId(factory.id_short_discribe_technology, "id_short_discribe_technology"))) {
    factory.id_short_discribe_technology = null;
  }

  if (isTempId(fkId(factory.id_cities, "id_cities"))) {
    throw new Error("Выберите город из справочника (новый город через форму не создаётся)");
  }

  let body = factoryToRequest(factory);
  if (opts?.ponoinputExtras) {
    body = appendPonoinputFactoryFields(body, factory);
  }
  let factoryId: number;

  if (mode === "create" || isTempId(factory.id_magasin_factory as number)) {
    const created = await apiPost<Record<string, unknown>>("/api/magasin-factory", body);
    const id = getNestedId(created, "id_magasin_factory") ?? (created.id_magasin_factory as number);
    if (typeof id !== "number" || id <= 0) throw new Error("Сервер не вернул id предприятия");
    factoryId = id;
  } else {
    factoryId = factory.id_magasin_factory as number;
    await apiPut(`/api/magasin-factory/${factoryId}`, body);
  }

  await syncPhones(factoryId, bundle.phones, baseline);
  await syncTechnologies(factoryId, bundle.technologies, baseline);
  await syncDropAirs(factoryId, bundle.dropAirs, baseline);
  await syncMyTrashes(factoryId, bundle.myTrashes, baseline);

  return factoryId;
}

export async function deleteFactoryCascade(factoryId: number, _registration?: string): Promise<void> {
  // Каскад связанных записей выполняется на бэке
  await apiDelete(`/api/magasin-factory/${factoryId}`);
}
