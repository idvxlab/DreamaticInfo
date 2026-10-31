/** A series declares one unit; a delimited list declares several, never a conversion. */
export function hasMixedUnits(unit: string): boolean {
  return new Set(unit.split(/[、，,；;]/).map(part => part.trim()).filter(Boolean)).size > 1;
}
