import React, { useState } from "react";

export default function BalanceHero({ summary, currency = "$", onOpenNewTransaction }) {
  // Synchronous initialization prevents flash of unmasked balances on reload
  const [isPrivate, setIsPrivate] = useState(() => {
    try {
      return localStorage.getItem("pocketledger_privacy") === "true";
    } catch {
      return false;
    }
  });

  const togglePrivacy = () => {
    setIsPrivate((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pocketledger_privacy", String(next));
      } catch {}
      return next;
    });
  };

  const net = summary?.net ?? 0;
  const income = summary?.total_income ?? 0;
  const expense = summary?.total_expense ?? 0;
  const savingsRate = summary?.savings_rate ?? 0;

  const formatMoney = (val) => {
    return `${currency}${Number(val).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const maskOrValue = (val, prefix = "") => {
    if (isPrivate) {
      return `${currency} ••••••`;
    }
    return `${prefix}${formatMoney(val)}`;
  };

  return (
    <section className="py-10 flex flex-col items-center text-center">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs uppercase tracking-widest text-[var(--text-tertiary)]">
          Net Balance
        </span>
        <button
          onClick={togglePrivacy}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors p-1"
          title={isPrivate ? "Reveal balances" : "Hide balances (Privacy Mode)"}
          aria-label={isPrivate ? "Disable privacy mode" : "Enable privacy mode"}
        >
          {isPrivate ? "👁" : "👁‍🗨"}
        </button>
      </div>

      {/* Main Net Balance: Render actual mask string in DOM when privacy mode is active */}
      <div
        className={`font-display text-5xl sm:text-6xl font-semibold tracking-tight transition-all duration-200 ${
          net >= 0 ? "text-[var(--text-primary)]" : "text-rose-400"
        }`}
      >
        {isPrivate
          ? `${currency} ••••••`
          : net < 0
          ? `-${formatMoney(Math.abs(net))}`
          : formatMoney(net)}
      </div>

      {/* Metric Pills */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400">
          <span className="font-semibold">+</span>
          <span>{maskOrValue(income)}</span>
          <span className="text-emerald-500/60 uppercase text-[10px]">Income</span>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-400">
          <span className="font-semibold">-</span>
          <span>{maskOrValue(expense)}</span>
          <span className="text-rose-500/60 uppercase text-[10px]">Expenses</span>
        </div>

        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs font-mono text-[var(--text-secondary)]">
          <span className="text-[var(--accent)] font-semibold">
            {isPrivate ? "••%" : `${savingsRate.toFixed(1)}%`}
          </span>
          <span className="text-[var(--text-tertiary)] uppercase text-[10px]">Savings</span>
        </div>

        <button
          onClick={onOpenNewTransaction}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[var(--accent)] text-[#0a0e16] font-semibold text-xs hover:opacity-90 transition-opacity ml-2 shadow-sm"
        >
          <span>+ Add Entry</span>
        </button>
      </div>
    </section>
  );
}
