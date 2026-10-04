import { describe, expect, test } from "bun:test";
import { catalog } from "./catalog";
import { initialSelection, reduceSelection } from "./selection";
import type { ComponentAvailability, ComponentId } from "./model";
const availability = new Map<ComponentId, ComponentAvailability>(catalog.map((item) => [item.id, { enabled: true, installed: false }] as const));
describe("component selection", () => {
  test("initial selection includes supported enabled rows and dependencies", () => {
    const value = initialSelection(catalog, availability);
    expect(value.selected.has("github-tools")).toBe(true);
    expect(value.selected.has("git")).toBe(true);
    expect(value.selected.has("tmux")).toBe(true);
  });
  test("disabled rows cannot be directly selected or selected by toggle-all", () => {
    const available = new Map(availability);
    available.set("aerospace" as ComponentId, { enabled: false, installed: false, reason: "macOS only" });
    const value = initialSelection(catalog, available);
    const index = catalog.findIndex((item) => item.id === "aerospace");
    const cursor = { ...value, cursor: index };
    expect(reduceSelection(cursor, "toggle", catalog, available).selected.has("aerospace")).toBe(false);
    expect(reduceSelection({ ...cursor, selected: new Set() }, "toggle-all", catalog, available).selected.has("aerospace")).toBe(false);
  });
  test("deselecting a missing prerequisite removes its dependent without hidden reselection", () => {
    let state = initialSelection(catalog, availability);
    const gitRow = catalog.findIndex((item) => item.id === "git");
    state = reduceSelection({ ...state, cursor: gitRow }, "toggle", catalog, availability);
    expect(state.selected.has("git")).toBe(false);
    expect(state.selected.has("github-tools")).toBe(false);
    expect(state.selected.has("github-tools-cron")).toBe(false);
    expect(state.selected.has("tmux-plugins")).toBe(false);
  });
  test("installed prerequisites need not be selected with their dependents", () => {
    const available = new Map(availability);
    available.set("git", { enabled: true, installed: true });
    const empty = { cursor: 0, selected: new Set<ComponentId>() };
    const dependent = catalog.findIndex((item) => item.id === "zsh-abbr");
    const next = reduceSelection({ ...empty, cursor: dependent }, "toggle", catalog, available);
    expect(next.selected.has("zsh-abbr")).toBe(true);
    expect(next.selected.has("git")).toBe(false);
  });
});
