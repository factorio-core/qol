/** Compares two Factorio prototype order strings with alphabetical tie-breaking by name. Returns negative if A before B, positive if B before A, or 0 if equal. */
export function comparePrototypeOrder(orderA: string | undefined, orderB: string | undefined, nameA: string, nameB: string): number {
  const oA = orderA || 'z';
  const oB = orderB || 'z';
  if (oA !== oB) {
    return oA < oB ? -1 : 1;
  }
  return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
}
