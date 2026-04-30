import { useId } from "react";

// =============================================================================
// Tabs — pill tabs on tablet+, labeled select on phones.
// =============================================================================
// Two responsive layouts share the same source of truth:
//
//   sm: and up   — horizontal pill bar with role="tablist" / role="tab".
//                  Active tab is filled orange; inactive tabs are cream
//                  with a brown border. Badge counts (e.g. pending
//                  invites) sit inside the pill on the right.
//
//   phones       — a native <select> wrapped in a <label>. Tabs labels
//                  can wrap awkwardly on a 360px row, and a select also
//                  gives users iOS/Android's native picker UI for
//                  jumping between tabs.
//
// State is controlled — the parent owns the active tab and is
// responsible for persisting it (e.g. mirroring it into the URL via
// ?tab=...). The component just renders + emits onChange.
//
// Accessibility:
//   * tablist + tab roles + aria-selected
//   * aria-controls + matching id on the panel (component consumers
//     are responsible for putting that id on their tabpanel <section>)
//   * Native <select> on mobile gives keyboard + screen reader support
//     for free; pills are real <button>s so Tab + Enter/Space "just
//     works".
// =============================================================================

export interface TabDef<T extends string> {
  id: T;
  label: string;
  /** Optional integer rendered as a small chip after the label
   * (think: pending-invites count). 0 / undefined renders nothing. */
  badge?: number;
}

interface TabsProps<T extends string> {
  tabs: TabDef<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name for the tablist. Required. */
  ariaLabel: string;
  /** Prefix for the per-tab id used by aria-controls. The parent's
   * tabpanel must have id={`${panelIdPrefix}-${activeTab}`}. */
  panelIdPrefix: string;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  panelIdPrefix,
}: TabsProps<T>) {
  // Pair the mobile select with a stable id; useId means we don't fight
  // with multiple Tabs components on one page.
  const selectId = useId();

  return (
    <>
      {/* ---- Mobile (phones): native select dropdown ---- */}
      <div className="sm:hidden mb-6">
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-[#785A38] uppercase tracking-wide mb-1"
        >
          Section
        </label>
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          aria-label={ariaLabel}
          className="w-full appearance-none rounded-md border-2 border-[#3D2817] bg-white px-3 py-2 text-sm font-semibold text-[#3D2817] shadow-[3px_3px_0px_0px_rgba(61,40,23,1)] focus:outline-none focus:ring-2 focus:ring-[#FF9F45]"
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.badge && t.badge > 0 ? ` (${t.badge})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* ---- Tablet+ : horizontal pill bar ---- */}
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="hidden sm:flex flex-wrap gap-2 mb-8 sm:mb-10"
      >
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${panelIdPrefix}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${panelIdPrefix}-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => {
                // Roving focus / arrow-key navigation across the
                // tablist, per the WAI-ARIA tabs pattern. Left / Right
                // wrap; Home / End jump to the ends.
                const idx = tabs.findIndex((x) => x.id === value);
                let next = idx;
                if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
                else if (e.key === "ArrowLeft")
                  next = (idx - 1 + tabs.length) % tabs.length;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = tabs.length - 1;
                else return;
                e.preventDefault();
                onChange(tabs[next].id);
                // Move keyboard focus to the new tab so the next
                // arrow keypress chains as the user expects.
                const el = document.getElementById(
                  `${panelIdPrefix}-tab-${tabs[next].id}`
                );
                el?.focus();
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F45] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFF8E7] ${
                selected
                  ? "bg-[#FF9F45] text-[#3D2817] border-[#3D2817] shadow-[3px_3px_0px_0px_rgba(61,40,23,1)]"
                  : "bg-white text-[#3D2817] border-[#3D2817] hover:bg-[#FFE8BA]"
              }`}
            >
              <span>{t.label}</span>
              {t.badge && t.badge > 0 ? (
                <span
                  className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold border-2 border-[#3D2817] ${
                    selected ? "bg-white text-[#3D2817]" : "bg-[#FF9F45] text-[#3D2817]"
                  }`}
                  aria-label={`${t.badge} pending`}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
