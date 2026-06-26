export function applyTechnologyFactoryOverlay(
  row: Record<string, unknown>,
  _factories: Record<string, unknown>[]
): Record<string, unknown> {
  return row;
}

export function patchTechnologyRowAfterSave(
  _prev: Record<string, unknown>,
  updated: Record<string, unknown>,
  factories: Record<string, unknown>[]
): Record<string, unknown> {
  return applyTechnologyFactoryOverlay(updated, factories);
}

export function enrichTechnologyRows(
  rows: Record<string, unknown>[],
  factories: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((r) => applyTechnologyFactoryOverlay(r, factories));
}
