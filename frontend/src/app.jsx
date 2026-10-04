import React, { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import BalanceHero from "./components/BalanceHero";
import TransactionTable from "./components/TransactionTable";
import BudgetTracker from "./components/BudgetTracker";
import TransactionModal from "./components/TransactionModal";
import AuthModal from "./components/AuthModal";
import {
  getAuthMe,
  logoutUser,
  getSummary,
  getTransactions,
  getBudgets,
  addTransaction,
  editTransaction,
  deleteTransaction,
  duplicateTransaction,
  setBudget,
  deleteBudget,
  updatePreferredCurrency,
} from "./lib/api";

export default function App() {
  const [currentMonth, setCurrentMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [user, setUser] = useState(null);
  const [currency, setCurrency] = useState("$");
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [alertBanner, setAlertBanner] = useState(null);

  // Check current session
  useEffect(() => {
    getAuthMe().then((u) => {
      if (u) {
        setUser(u);
        if (u.currency) setCurrency(u.currency);
      }
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumData, txData, bData] = await Promise.all([
        getSummary(currentMonth),
        getTransactions(currentMonth),
        getBudgets(currentMonth),
      ]);
      setSummary(sumData);
      setTransactions(txData);
      setBudgets(bData);
    } catch (err) {
      console.warn("Failed to load month data:", err.message);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCurrencyChange = async (newCurr) => {
    setCurrency(newCurr);
    if (user) {
      await updatePreferredCurrency(newCurr).catch(() => {});
    }
  };

  const handleSaveTransaction = async (txData) => {
    try {
      let res;
      if (editingTx) {
        res = await editTransaction(editingTx.id, txData);
      } else {
        res = await addTransaction(txData);
      }

      if (res.alert) {
        setAlertBanner({
          category: res.alert.category,
          message: res.alert.exceeded
            ? `⚠️ Budget Exceeded for ${res.alert.category}! ($${res.alert.spent} spent of $${res.alert.monthly_limit} limit)`
            : `⚠️ Nearing budget limit for ${res.alert.category}`,
        });
        setTimeout(() => setAlertBanner(null), 6000);
      }

      setIsTxModalOpen(false);
      setEditingTx(null);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to save transaction");
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await duplicateTransaction(id);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to duplicate");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) return;
    try {
      await deleteTransaction(id);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to delete");
    }
  };

  const handleSetBudget = async (category, limit) => {
    try {
      await setBudget(category, limit);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to set budget");
    }
  };

  const handleDeleteBudget = async (category) => {
    try {
      await deleteBudget(category);
      loadData();
    } catch (err) {
      alert(err.message || "Failed to delete budget");
    }
  };

  const handleLogout = async () => {
    await logoutUser().catch(() => {});
    setUser(null);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <Header
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          user={user}
          currency={currency}
          onCurrencyChange={handleCurrencyChange}
          onOpenAuth={() => setIsAuthOpen(true)}
          onLogout={handleLogout}
        />

        {alertBanner && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center justify-between">
            <span>{alertBanner.message}</span>
            <button
              onClick={() => setAlertBanner(null)}
              className="text-rose-400 hover:text-rose-200"
            >
              ✕
            </button>
          </div>
        )}

        <BalanceHero
          summary={summary}
          currency={currency}
          onOpenNewTransaction={() => {
            setEditingTx(null);
            setIsTxModalOpen(true);
          }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          <div className="lg:col-span-2">
            <TransactionTable
              transactions={transactions}
              currency={currency}
              onEdit={(tx) => {
                setEditingTx(tx);
                setIsTxModalOpen(true);
              }}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          </div>

          <div>
            <BudgetTracker
              budgets={budgets}
              currency={currency}
              onSetBudget={handleSetBudget}
              onDeleteBudget={handleDeleteBudget}
            />
          </div>
        </div>
      </div>

      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTx(null);
        }}
        onSave={handleSaveTransaction}
        editingTx={editingTx}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(u) => {
          setUser(u);
          if (u.currency) setCurrency(u.currency);
          loadData();
        }}
      />
    </div>
  );
}
