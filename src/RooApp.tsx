import { PooRegistryApp } from "./PooRegistryApp";

export function RooApp() {
  return (
    <PooRegistryApp
      apiModule="roo"
      sidebarTitle="РОО — таблицы"
      colWidthsStorageKey="eco-service-roo-col-widths"
      myTrashStorageKey="roo-my-trash-factory-v1"
    />
  );
}
