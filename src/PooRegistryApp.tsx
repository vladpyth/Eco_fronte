import { useCallback, type ReactNode } from "react";
import { apiGet } from "./api";
import { setApiModule, type ApiModule } from "./apiModule";
import { GridRegistryApp } from "./GridRegistryApp";
import { handleRooGridRefAction } from "./rooGridRefActions";
import {
  ROO_GRID_REF_SPECS,
  type RooGridRefKind,
} from "./rooGridRefConfig";
import { createMyTrashOverlay } from "./rooMyTrashOverlay";
import { enrichTechnologyRows, patchTechnologyRowAfterSave } from "./rooTechnologyOverlay";
import {
  ROO_SECTION_ORDER,
  getRooSection,
  rooCellValue,
  type RooCol,
  type RooSectionId,
} from "./rooSectionsConfig";

export type PooRegistryAppProps = {
  apiModule: Extract<ApiModule, "roo" | "roio" | "ponoinput">;
  sidebarTitle: string;
  colWidthsStorageKey: string;
  myTrashStorageKey: string;
  sectionOrder?: RooSectionId[];
  getSection?: (id: RooSectionId) => import("./rooSectionsConfig").RooSectionDef;
  cardSectionIds?: string[];
  /** Пагинация таблиц (mode: "server" — page/size/q на бэке). */
  pagination?: boolean | { pageSize?: number; pageSizeOptions?: number[]; mode?: "client" | "server" };
  defaultSection?: string;
  leadingSections?: Array<{
    id: string;
    sidebar: string;
    title: string;
    render: () => ReactNode;
  }>;
};

export function PooRegistryApp(props: PooRegistryAppProps) {
  setApiModule(props.apiModule);

  const myTrashOverlay = createMyTrashOverlay(props.myTrashStorageKey);

  const loadGridRefLists = useCallback(async () => {
    const kinds = Object.keys(ROO_GRID_REF_SPECS) as RooGridRefKind[];
    const entries = await Promise.all(
      kinds.map(async (kind) => {
        const spec = ROO_GRID_REF_SPECS[kind];
        if (spec.paginated) {
          return [kind, [] as Record<string, unknown>[]] as const;
        }
        try {
          const list = await apiGet<Record<string, unknown>[]>(spec.apiPath);
          return [kind, Array.isArray(list) ? list : ([] as Record<string, unknown>[])] as const;
        } catch {
          return [kind, []] as const;
        }
      })
    );
    const out = {} as Record<RooGridRefKind, Record<string, unknown>[]>;
    for (const [kind, list] of entries) out[kind] = list;
    return out;
  }, []);

  const sectionOrder = props.sectionOrder ?? ROO_SECTION_ORDER;
  const resolveSection = props.getSection ?? getRooSection;
  const cardSectionIds =
    props.cardSectionIds ?? ["magasin-factory", "my-trash", "drop-air", "magazin-trash"];

  return (
    <GridRegistryApp
      sidebarTitle={props.sidebarTitle}
      colWidthsStorageKey={props.colWidthsStorageKey}
      defaultSection={props.defaultSection ?? "magasin-factory"}
      sectionOrder={sectionOrder}
      getSection={(id) => resolveSection(id as RooSectionId)}
      gridRefSpecs={ROO_GRID_REF_SPECS}
      cellValue={(row, col, cache) =>
        rooCellValue(row, col as RooCol, cache as Record<RooGridRefKind, Record<string, unknown>[]> | undefined)
      }
      loadGridRefLists={loadGridRefLists}
      enrichLoadedRows={(sectionId, rows, lists) => {
        const factories = lists.magasinFactory ?? [];
        if (sectionId === "my-trash") return myTrashOverlay.enrichMyTrashRows(rows, factories);
        if (sectionId === "technology") return enrichTechnologyRows(rows, factories);
        return rows;
      }}
      patchRowAfterSave={(sectionId, prev, updated, lists) => {
        const factories = lists.magasinFactory ?? [];
        if (sectionId === "my-trash") return myTrashOverlay.patchMyTrashRowAfterSave(prev, updated, factories);
        if (sectionId === "technology") return patchTechnologyRowAfterSave(prev, updated, factories);
        return updated;
      }}
      handleGridRefAction={(action, sectionId, col, row, picked) =>
        handleRooGridRefAction(action, sectionId, col as RooCol, row, picked)
      }
      cardSectionIds={cardSectionIds}
      pagination={props.pagination}
      leadingSections={props.leadingSections}
    />
  );
}
