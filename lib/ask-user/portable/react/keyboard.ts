/**
 * Pure keyboard maths for {@link AskUserView}'s single-choice option groups.
 *
 * Kept out of the component on purpose: the repository has no DOM test
 * harness, so the index arithmetic is asserted directly instead of through a
 * hand-built DOM stub. The component only maps a keydown event onto these
 * functions.
 */

/** Keys that move the selection inside a single-choice group. */
const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"]);

/**
 * The option index a single-choice group's navigation key should land on, or
 * `null` when the key is not this component's to handle.
 *
 * `currentIndex` is the selected option's index, or `-1` when nothing is
 * selected. A forward key on an unselected group selects the first option, a
 * backward key (or `End`) selects the last — the behaviour of a native
 * radiogroup. `optionCount <= 0` is not navigable.
 */
export function radioNavigationTarget(currentIndex: number, key: string, optionCount: number): number | null {
  if (optionCount <= 0) return null;
  if (!NAVIGATION_KEYS.has(key)) return null;

  const selected = currentIndex >= 0 && currentIndex < optionCount ? currentIndex : -1;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (selected === -1) {
    return key === "ArrowUp" || key === "ArrowLeft" ? optionCount - 1 : 0;
  }
  if (key === "ArrowDown" || key === "ArrowRight") return (selected + 1) % optionCount;
  return (selected - 1 + optionCount) % optionCount;
}

/**
 * Roving tabindex for one option of a single-choice group: the group holds a
 * single tab stop — the selected option, or the first option while nothing is
 * selected. Every other option is reachable by the arrow keys, not by Tab.
 */
export function radioTabIndex(selected: boolean, anySelected: boolean, index: number): 0 | -1 {
  return selected || (!anySelected && index === 0) ? 0 : -1;
}
