/** Локальный overlay паспорта предприятия (РОИО) — мутации без бэка. */

const LS_KEY = "roio-factory-hub-overlay-v1";

export type HubPhone = {
  _key: string;
  id_phone_number?: number;
  number: string;
  /** 0 — собственник, 1 — объект; null — ещё не выбран */
  ur_ob: 0 | 1 | null;
};

export type HubTechnology = {
  _key: string;
  id_technology?: number;
  id_class_danger: unknown;
  id_magazin_trash: unknown;
  id_phys_trash: unknown;
  /** Только РОИО для внесения */
  get?: boolean | null;
  spot?: string;
};

export type HubDropAir = {
  _key: string;
  id_drop_air?: number;
  id_class_danger: unknown;
  id_name_grope_air: unknown;
  value_drop_trash: number;
};

export type HubMyTrash = {
  _key: string;
  id_my_trash?: number;
  id_class_danger: unknown;
  id_magazin_trash: unknown;
  value_trash: number;
  /** Только РОИО для внесения */
  get?: boolean | null;
  spot?: string;
};

export type HubFactoryBundle = {
  factory: Record<string, unknown>;
  phones: HubPhone[];
  technologies: HubTechnology[];
  dropAirs: HubDropAir[];
  myTrashes: HubMyTrash[];
  /** Локально созданная запись (ещё нет на сервере). */
  localCreate?: boolean;
};

export type HubOverlayState = {
  /** Удалённые id предприятий (скрываем из списка). */
  deletedIds: number[];
  /** Полные бандлы по id (или temp-id < 0). */
  byId: Record<string, HubFactoryBundle>;
};

function empty(): HubOverlayState {
  return { deletedIds: [], byId: {} };
}

export function loadHubOverlay(): HubOverlayState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as HubOverlayState;
    return {
      deletedIds: Array.isArray(p.deletedIds) ? p.deletedIds : [],
      byId: p.byId && typeof p.byId === "object" ? p.byId : {},
    };
  } catch {
    return empty();
  }
}

export function saveHubOverlay(state: HubOverlayState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function nextTempId(): number {
  return -Date.now();
}

export function newRowKey(): string {
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
