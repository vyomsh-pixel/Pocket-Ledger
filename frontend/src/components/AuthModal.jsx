import React, { useState } from "react";
import { loginUser, registerUser } from "../lib/api";

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [template, setTemplate] = useState("salaried");
  const [currency, setCurrency] = useState("$");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let res;
      if (isRegister) {
        res = await registerUser(username, password, template, currency);
      } else {
        res = await loginUser(username, password);
      }
      onAuthSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
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

        <h2 className="font-display text-2xl font-semibold mb-1">
          {isRegister ? "Open Your Ledger" : "Access PocketLedger"}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-6">
          {isRegister
            ? "Choose a starter blueprint and establish your private accounts."
            : "Sign in to inspect and reconcile your financial journal."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. vyom"
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/20 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/20 border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Starter Template
                </label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-black/20 border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  <option value="salaried">Salaried (Rent, Dining, Utilities, Transport, Investments)</option>
                  <option value="freelance">Freelance (Software, Office, Marketing, Tax Reserves)</option>
                  <option value="minimalist">Minimalist (Groceries, Living, Utilities, Personal Care)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                  Default Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-black/20 border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  <option value="$">$ (USD)</option>
                  <option value="₹">₹ (INR)</option>
                  <option value="€">€ (EUR)</option>
                  <option value="£">£ (GBP)</option>
                  <option value="¥">¥ (JPY)</option>
                </select>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[#0a0e16] font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
          >
            {loading ? "Verifying..." : isRegister ? "Create Ledger Account" : "Sign In"}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-[var(--border)] text-center text-xs text-[var(--text-secondary)]">
          {isRegister ? "Already registered?" : "New to PocketLedger?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-[var(--accent)] font-semibold hover:underline"
          >
            {isRegister ? "Sign In" : "Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
