import { PooRegistryApp } from "./PooRegistryApp";
import { RoioFactoryHub } from "./RoioFactoryHub";

export function RoioApp() {
  return (
    <PooRegistryApp
      apiModule="roio"
      sidebarTitle="РОИО — таблицы"
      colWidthsStorageKey="eco-service-roio-col-widths"
      myTrashStorageKey="roio-my-trash-factory-v1"
      pagination={{ pageSize: 50, pageSizeOptions: [25, 50, 100, 200], mode: "server" }}
      defaultSection="factory-hub"
      leadingSections={[
        {
          id: "factory-hub",
          sidebar: "Паспорт предприятия",
          title: "Паспорт предприятия",
          render: () => <RoioFactoryHub />,
        },
      ]}
    />
  );
}
