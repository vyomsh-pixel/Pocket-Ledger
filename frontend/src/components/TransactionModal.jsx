import React, { useState, useEffect } from "react";

const DEFAULT_CATEGORIES = [
  "Rent & Housing",
  "Food & Dining",
  "Groceries",
  "Utilities",
  "Transport",
  "Shopping",
  "Investments",
  "Salary",
  "Freelance",
  "Dividends",
  "Miscellaneous",
];

export default function TransactionModal({ isOpen, onClose, onSave, editingTx = null }) {
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("Food & Dining");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [customCat, setCustomCat] = useState("");
  const [isCustomCat, setIsCustomCat] = useState(false);

  useEffect(() => {
    if (editingTx) {
      setType(editingTx.type || "expense");
      setCategory(editingTx.category || "Food & Dining");
      setAmount(editingTx.amount ? String(editingTx.amount) : "");
      setDate(editingTx.date || new Date().toISOString().slice(0, 10));
      setNote(editingTx.note || "");
    } else {
      setType("expense");
      setCategory("Food & Dining");
      setAmount("");
      setDate(new Date().toISOString().slice(0, 10));
      setNote("");
    }
    setIsCustomCat(false);
    setCustomCat("");
  }, [editingTx, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalCat = isCustomCat && customCat.trim() ? customCat.trim() : category;
    if (!amount || parseFloat(amount) <= 0) return;

    onSave({
      type,
      category: finalCat,
      amount: parseFloat(amount),
      date,
      note: note.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-2xl relative text-[var(--text-primary)]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm"
        >
          ✕
        </button>

        <h2 className="font-display text-2xl font-semibold mb-4">
          {editingTx ? "Edit Entry" : "New Transaction"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-black/30 border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
                type === "expense"
                  ? "bg-rose-500/20 text-rose-400 font-semibold border border-rose-500/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={`py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
                type === "income"
                  ? "bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Income
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Amount
            </label>
            <input
              type="number"
              step="0.01"
              required
              autoFocus
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/20 border border-[var(--border)] font-mono text-base focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Category */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
                Category
              </label>
              <button
                type="button"
                onClick={() => setIsCustomCat(!isCustomCat)}
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                {isCustomCat ? "Choose standard" : "+ Custom category"}
              </button>
            </div>

            {isCustomCat ? (
              <input
                type="text"
                required
                placeholder="Enter custom category..."
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-black/20 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-black/20 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
              >
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-[var(--surface)]">
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-black/20 border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Dinner with team, organic groceries"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-black/20 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-[#0a0e16] font-semibold text-sm hover:opacity-90 transition-opacity mt-4"
          >
            {editingTx ? "Update Transaction" : "Record Transaction"}
          </button>
        </form>
      </div>
    </div>
  );
}
