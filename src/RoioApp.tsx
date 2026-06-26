import { PooRegistryApp } from "./PooRegistryApp";

export function RoioApp() {
  return (
    <PooRegistryApp
      apiModule="roio"
      sidebarTitle="РОИО — таблицы"
      colWidthsStorageKey="eco-service-roio-col-widths"
      myTrashStorageKey="roio-my-trash-factory-v1"
    />
  );
}
