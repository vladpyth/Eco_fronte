import { PooRegistryApp } from "./PooRegistryApp";
import { RoioFactoryHub } from "./RoioFactoryHub";

export function RooApp() {
  return (
    <PooRegistryApp
      apiModule="roo"
      sidebarTitle="РОО — таблицы"
      colWidthsStorageKey="eco-service-roo-col-widths"
      myTrashStorageKey="roo-my-trash-factory-v1"
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
