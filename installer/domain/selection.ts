import type { ComponentAvailability, ComponentDefinition, ComponentId, SelectionState } from "./model";
export type SelectionAction = "up" | "down" | "toggle" | "toggle-all";
export function initialSelection(definitions: readonly ComponentDefinition[], availability: ReadonlyMap<ComponentId, ComponentAvailability>): SelectionState {
  const selected = new Set(definitions.filter((item) => availability.get(item.id)?.enabled).map((item) => item.id));
  closeDependencies(selected, definitions, availability);
  return { cursor: 0, selected };
}
function closeDependencies(selected: Set<ComponentId>, definitions: readonly ComponentDefinition[], availability: ReadonlyMap<ComponentId, ComponentAvailability>): void {
  let changed = true;
  while (changed) { changed = false; for (const id of [...selected]) { const item = definitions.find((entry) => entry.id === id); for (const dependency of item?.requires ?? []) { const state = availability.get(dependency); if (state?.enabled && !state.installed && !selected.has(dependency)) { selected.add(dependency); changed = true; } } } }
}
export function reduceSelection(state: SelectionState, action: SelectionAction, definitions: readonly ComponentDefinition[], availability: ReadonlyMap<ComponentId, ComponentAvailability>): SelectionState {
  if (!definitions.length) return state;
  if (action === "up" || action === "down") return { ...state, cursor: Math.max(0, Math.min(definitions.length - 1, state.cursor + (action === "up" ? -1 : 1))) };
  const selected = new Set(state.selected);
  if (action === "toggle-all") {
    const enabled = definitions.filter((item) => availability.get(item.id)?.enabled);
    if (enabled.length && enabled.every((item) => selected.has(item.id))) selected.clear();
    else { for (const item of enabled) selected.add(item.id); closeDependencies(selected, definitions, availability); }
    return { ...state, selected };
  }
  const item = definitions[state.cursor];
  if (!availability.get(item.id)?.enabled) return state;
  if (selected.has(item.id)) {
    selected.delete(item.id);
    let changed = true;
    while (changed) { changed = false; for (const candidate of definitions) if (selected.has(candidate.id) && candidate.requires.some((id) => !availability.get(id)?.installed && !selected.has(id))) { selected.delete(candidate.id); changed = true; } }
  } else {
    selected.add(item.id); closeDependencies(selected, definitions, availability);
  }
  return { ...state, selected };
}
