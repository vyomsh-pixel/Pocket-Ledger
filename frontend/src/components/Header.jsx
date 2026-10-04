import React from "react";

const CURRENCIES = ["$", "₹", "€", "£", "¥", "₩", "Fr", "R$", "kr", "zł"];

export default function Header({
  currentMonth,
  onMonthChange,
  user,
  currency,
  onCurrencyChange,
  onOpenAuth,
  onLogout,
}) {
  const formatMonthLabel = (m) => {
    if (!m) return "All Time";
    const [y, mon] = m.split("-");
    const d = new Date(parseInt(y), parseInt(mon) - 1, 1);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  };

  const shiftMonth = (delta) => {
    const [y, mon] = (currentMonth || new Date().toISOString().slice(0, 7)).split("-").map(Number);
    const d = new Date(y, mon - 1 + delta, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    onMonthChange(newMonth);
  };

  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-6 border-b border-[var(--border)]">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-lg font-display text-[var(--accent)] shadow-sm">
          ❖
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            PocketLedger
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">
            Mindful Financial Ledger
          </p>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-sm">
        <button
          onClick={() => shiftMonth(-1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-colors"
          title="Previous Month"
        >
          ‹
        </button>
        <span className="font-display text-sm font-medium px-2 min-w-[130px] text-center text-[var(--text-primary)]">
          {formatMonthLabel(currentMonth)}
        </span>
        <button
          onClick={() => shiftMonth(1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-colors"
          title="Next Month"
        >
          ›
        </button>
      </div>

      {/* Controls & Auth */}
      <div className="flex items-center gap-3">
        {/* Currency select */}
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {user ? (
          <div className="flex items-center gap-2.5 pl-2 border-l border-[var(--border)]">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-[#0a0e16] font-semibold text-xs flex items-center justify-center">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-[var(--text-secondary)] hidden md:inline">
              {user.username}
            </span>
            <button
              onClick={onLogout}
              className="text-xs font-mono text-[var(--text-tertiary)] hover:text-rose-400 transition-colors ml-1"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[#0a0e16] font-semibold text-xs hover:opacity-90 transition-opacity"
          >
            Sign In / Register
          </button>
        )}
      </div>
    </header>
  );
}
