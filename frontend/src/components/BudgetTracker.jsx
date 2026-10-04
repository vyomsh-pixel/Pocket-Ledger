import React, { useState } from "react";

export default function BudgetTracker({
  budgets = [],
  currency = "$",
  onSetBudget,
  onDeleteBudget,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newLimit, setNewLimit] = useState("");

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newCat.trim() || !newLimit || parseFloat(newLimit) <= 0) return;
    onSetBudget(newCat.trim(), parseFloat(newLimit));
    setNewCat("");
    setNewLimit("");
    setShowAdd(false);
  };

  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
            Category Budgets
          </h3>
          <p className="font-mono text-[11px] text-[var(--text-tertiary)]">
            Monthly allowances & spending velocity
          </p>
        </div>

        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs font-mono text-[var(--accent)] hover:underline"
        >
          {showAdd ? "Cancel" : "+ Set Budget"}
        </button>
      </div>

      {/* Inline Add Budget */}
      {showAdd && (
        <form
          onSubmit={handleAddSubmit}
          className="p-3.5 mb-5 rounded-xl bg-black/30 border border-[var(--border)] flex flex-wrap gap-2 items-center"
        >
          <input
            type="text"
            required
            placeholder="Category name..."
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg bg-black/20 border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            step="0.01"
            required
            placeholder="Monthly limit..."
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            className="w-28 px-3 py-1.5 rounded-lg bg-black/20 border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[#0a0e16] font-semibold text-xs hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </form>
      )}

      {/* Budget Bars */}
      {budgets.length === 0 ? (
        <p className="text-xs font-mono text-[var(--text-tertiary)] py-4 text-center">
          No monthly budgets configured yet. Click "+ Set Budget" above to establish targets.
        </p>
      ) : (
        <div className="space-y-4">
          {budgets.map((b) => {
            const spent = b.spent || 0;
            const limit = b.monthly_limit || 1;
            const pct = Math.min((spent / limit) * 100, 100);
            const exceeded = b.exceeded || spent > limit;
            const nearLimit = b.near_limit || (!exceeded && spent >= limit * 0.85);

            return (
              <div key={b.category} className="group">
                <div className="flex justify-between items-baseline text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{b.category}</span>
                    {exceeded && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        Exceeded
                      </span>
                    )}
                    {nearLimit && !exceeded && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Near Limit
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className={exceeded ? "text-rose-400 font-semibold" : "text-[var(--text-secondary)]"}>
                      {currency}
                      {spent.toLocaleString()}
                    </span>
                    <span className="text-[var(--text-tertiary)]">/</span>
                    <span className="text-[var(--text-tertiary)]">
                      {currency}
                      {limit.toLocaleString()}
                    </span>
                    <button
                      onClick={() => onDeleteBudget(b.category)}
                      title="Remove budget target"
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-[var(--text-tertiary)] hover:text-rose-400 transition-opacity ml-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      exceeded
                        ? "bg-rose-500"
                        : nearLimit
                        ? "bg-amber-400"
                        : "bg-[var(--accent)]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
