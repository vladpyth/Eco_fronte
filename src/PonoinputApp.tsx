import { PooRegistryApp } from "./PooRegistryApp";
import {
  PONOINPUT_SECTION_ORDER,
  getPonoinputSection,
} from "./ponoinputSectionsConfig";

export function PonoinputApp() {
  return (
    <PooRegistryApp
      apiModule="ponoinput"
      sidebarTitle="РОИО (для внесения) — таблицы"
      colWidthsStorageKey="eco-service-ponoinput-col-widths"
      myTrashStorageKey="ponoinput-my-trash-factory-v1"
      sectionOrder={PONOINPUT_SECTION_ORDER}
      getSection={getPonoinputSection}
      cardSectionIds={[
        "magasin-factory",
        "my-trash",
        "technology",
        "drop-air",
        "magazin-trash",
      ]}
    />
  );
}
