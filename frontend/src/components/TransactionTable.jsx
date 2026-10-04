import React, { useState } from "react";

export default function TransactionTable({
  transactions = [],
  currency = "$",
  onEdit,
  onDuplicate,
  onDelete,
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = transactions.filter((tx) => {
    if (typeFilter !== "all" && tx.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCat = (tx.category || "").toLowerCase().includes(q);
      const matchNote = (tx.note || "").toLowerCase().includes(q);
      if (!matchCat && !matchNote) return false;
    }
    return true;
  });

  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden shadow-sm">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-semibold text-[var(--text-primary)]">
            Transactions
          </span>
          <span className="font-mono text-xs text-[var(--text-tertiary)] px-2 py-0.5 rounded-full bg-black/20">
            {filtered.length} entries
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <input
            type="text"
            placeholder="Search notes or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-black/20 border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] w-full sm:w-48"
          />

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="all">All</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-xs text-[var(--text-tertiary)] font-mono">
          No transactions found for this period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/20 border-b border-[var(--border)] font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Note</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono text-xs">
              {filtered.map((tx) => {
                const isIncome = tx.type === "income";
                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => onEdit(tx)}
                  >
                    <td className="px-5 py-3.5 text-[var(--text-tertiary)] whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          isIncome
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-white/[0.04] text-[var(--text-secondary)] border border-[var(--border)]"
                        }`}
                      >
                        {tx.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--text-secondary)] truncate max-w-[200px] font-sans text-xs">
                      {tx.note || "—"}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-semibold whitespace-nowrap ${
                        isIncome ? "text-emerald-400" : "text-[var(--text-primary)]"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {currency}
                      {Number(tx.amount).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td
                      className="px-5 py-3.5 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onDuplicate(tx.id)}
                          title="Duplicate entry"
                          className="px-2 py-1 rounded bg-black/20 hover:bg-white/[0.08] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-[11px]"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => onDelete(tx.id)}
                          title="Delete entry"
                          className="px-2 py-1 rounded bg-black/20 hover:bg-rose-500/20 text-[var(--text-tertiary)] hover:text-rose-400 transition-colors text-[11px]"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
