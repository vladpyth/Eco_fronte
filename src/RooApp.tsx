import { useCallback, useEffect } from "react";
import { apiGet } from "./api";
import { setApiModule } from "./apiModule";
import { GridRegistryApp } from "./GridRegistryApp";
import { handleRooGridRefAction } from "./rooGridRefActions";
import {
  ROO_GRID_REF_SPECS,
  type RooGridRefKind,
} from "./rooGridRefConfig";
import {
  enrichMyTrashRows,
  patchMyTrashRowAfterSave,
} from "./rooMyTrashOverlay";
import {
  ROO_SECTION_ORDER,
  getRooSection,
  rooCellValue,
  type RooCol,
  type RooSectionId,
} from "./rooSectionsConfig";

const ROO_COL_WIDTHS_LS = "eco-service-roo-col-widths";

export function RooApp() {
  useEffect(() => {
    setApiModule("roo");
  }, []);

  const loadGridRefLists = useCallback(async () => {
    const kinds = Object.keys(ROO_GRID_REF_SPECS) as RooGridRefKind[];
    const entries = await Promise.all(
      kinds.map(async (kind) => {
        const spec = ROO_GRID_REF_SPECS[kind];
        try {
          const list = await apiGet<Record<string, unknown>[]>(spec.apiPath);
          return [kind, Array.isArray(list) ? list : []] as const;
        } catch {
          return [kind, []] as const;
        }
      })
    );
    const out = {} as Record<RooGridRefKind, Record<string, unknown>[]>;
    for (const [kind, list] of entries) out[kind] = list;
    return out;
  }, []);

  return (
    <GridRegistryApp
      sidebarTitle="РОО — таблицы"
      colWidthsStorageKey={ROO_COL_WIDTHS_LS}
      defaultSection="magasin-factory"
      sectionOrder={ROO_SECTION_ORDER}
      getSection={(id) => getRooSection(id as RooSectionId)}
      gridRefSpecs={ROO_GRID_REF_SPECS}
      cellValue={(row, col, cache) =>
        rooCellValue(row, col as RooCol, cache as Record<RooGridRefKind, Record<string, unknown>[]> | undefined)
      }
      loadGridRefLists={loadGridRefLists}
      enrichLoadedRows={(sectionId, rows, lists) =>
        sectionId === "my-trash"
          ? enrichMyTrashRows(rows, lists.magasinFactory ?? [])
          : rows
      }
      patchRowAfterSave={(sectionId, prev, updated, lists) =>
        sectionId === "my-trash"
          ? patchMyTrashRowAfterSave(prev, updated, lists.magasinFactory ?? [])
          : updated
      }
      handleGridRefAction={(action, sectionId, col, row, picked) =>
        handleRooGridRefAction(action, sectionId, col as RooCol, row, picked)
      }
    />
  );
}
