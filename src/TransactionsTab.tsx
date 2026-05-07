import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { BudgetItem, TransactionItem } from "./App";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  items: BudgetItem[];
  totalIncome: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats a Firestore doc into a typed TransactionItem. */
function fromDoc(d: import("firebase/firestore").QueryDocumentSnapshot): TransactionItem {
  return { id: d.id, ...d.data() } as TransactionItem;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransactionsTab({ items, totalIncome }: Props) {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  // Form state
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState<number | "">("");
  const [newDate, setNewDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Multi-select tally
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Real-time listener ────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "transactions"), (snap) => {
      setTransactions(snap.docs.map(fromDoc));
    });
    return unsub;
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const totalTransactions = useMemo(
    () => transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [transactions]
  );

  const totalActual = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.actual) || 0), 0),
    [items]
  );

  const finalRemaining = useMemo(
    () => totalIncome - totalActual - totalTransactions,
    [totalIncome, totalActual, totalTransactions]
  );

  const selectedTotal = useMemo(
    () =>
      transactions
        .filter((t) => selectedIds.has(t.id))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [transactions, selectedIds]
  );

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const ta = new Date(a.date).getTime();
        const tb = new Date(b.date).getTime();
        if (!isNaN(ta) && !isNaN(tb)) return tb - ta;
        return b.id.localeCompare(a.id);
      }),
    [transactions]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const saveTransaction = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newLabel.trim() || newAmount === "") return;

      const payload = {
        label: newLabel,
        amount: Number(newAmount) || 0,
        date: newDate || new Date().toISOString().split("T")[0],
      };

      if (editingId) {
        await updateDoc(doc(db, "transactions", editingId), payload);
        setEditingId(null);
      } else {
        await addDoc(collection(db, "transactions"), payload);
      }

      setNewLabel("");
      setNewAmount("");
      setNewDate("");
    },
    [editingId, newLabel, newAmount, newDate]
  );

  const deleteTransaction = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "transactions", id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const beginEdit = useCallback((t: TransactionItem) => {
    setEditingId(t.id);
    setNewLabel(t.label);
    setNewAmount(t.amount);
    setNewDate(t.date);
    document.getElementById("transaction-form")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setNewLabel("");
    setNewAmount("");
    setNewDate("");
  }, []);

  // ── Display date helper ───────────────────────────────────────────────────

  const displayDay = useMemo(() => {
    return new Date(newDate ? newDate + "T00:00:00" : Date.now()).getDate();
  }, [newDate]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 relative">

      {/* Floating tally for selected items */}
      {selectedIds.size > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-50 bg-[#6B7C3A] border border-[#8a9e4a] rounded-2xl p-4 shadow-xl flex items-center gap-4 text-white"
        >
          <div>
            <p className="text-[10px] font-black tracking-wider text-[#c8db7a] uppercase">
              Selected Tally
            </p>
            <p className="text-2xl font-black mt-0.5">${selectedTotal}</p>
          </div>
          <button
            onClick={clearSelection}
            className="text-xs bg-white text-[#6B7C3A] px-2.5 py-1.5 font-black rounded-lg uppercase tracking-wider hover:bg-gray-100 transition shadow-sm"
            aria-label="Clear selection"
          >
            Clear
          </button>
        </div>
      )}

      {/* Summary banner */}
      <div className="bg-orange-500 border border-orange-400 rounded-2xl p-6 shadow-md flex justify-between items-center px-8">
        <div>
          <p className="text-xs font-black tracking-wider text-orange-200 uppercase">
            Total Transactions
          </p>
          <p className="text-3xl sm:text-4xl font-black text-white mt-1">
            ${totalTransactions}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-black tracking-wider text-orange-200 uppercase">
            Final Remaining
          </p>
          <p
            className={`text-3xl sm:text-4xl font-black mt-1 ${
              finalRemaining >= 0 ? "text-[#c8db7a]" : "text-orange-300"
            }`}
          >
            ${finalRemaining}
          </p>
        </div>
      </div>

      {/* Add / Edit form */}
      <form
        id="transaction-form"
        onSubmit={saveTransaction}
        className="flex flex-col gap-3 w-full"
      >
        <input
          type="text"
          placeholder="Transaction description"
          className="w-full p-4 border border-pink-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800 text-lg"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          aria-label="Transaction description"
        />

        <div className="flex gap-3 w-full">
          <input
            type="number"
            placeholder="Amount ($)"
            className="flex-1 p-4 border border-pink-300 rounded-xl shadow-sm bg-white text-gray-800 text-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
            value={newAmount}
            onChange={(e) => setNewAmount(Number(e.target.value) || "")}
            aria-label="Transaction amount"
          />

          {/* Date picker — shows day number, full picker on click */}
          <div className="relative p-4 border border-pink-300 rounded-xl shadow-sm bg-white text-gray-800 text-lg flex items-center justify-center min-w-[4rem] text-center font-bold cursor-pointer">
            <span aria-hidden="true">{displayDay}</span>
            <input
              type="date"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label="Transaction date"
            />
          </div>
        </div>

        <div className="flex gap-2 w-full">
          <button
            type="submit"
            className="flex-1 bg-orange-500 text-white p-4 rounded-xl font-black text-xl hover:bg-orange-600 transition shadow-md uppercase tracking-wider"
          >
            {editingId ? "SAVE" : "+ ADD"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="flex-1 bg-gray-600 text-white p-4 rounded-xl font-black text-xl hover:bg-gray-700 transition shadow-md"
            >
              CANCEL
            </button>
          )}
        </div>
      </form>

      {/* Transaction list */}
      <div className="space-y-3">
        {sortedTransactions.length === 0 ? (
          <div className="p-12 text-center bg-white/10 rounded-2xl border border-pink-400/40">
            <p className="font-bold text-white/70 uppercase tracking-widest text-sm">
              No transactions yet
            </p>
          </div>
        ) : (
          sortedTransactions.map((t) => {
            const selected = selectedIds.has(t.id);
            return (
              <TransactionRow
                key={t.id}
                transaction={t}
                selected={selected}
                onToggle={() => toggleSelection(t.id)}
                onEdit={() => beginEdit(t)}
                onDelete={() => deleteTransaction(t.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

interface TransactionRowProps {
  transaction: TransactionItem;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TransactionRow({
  transaction: t,
  selected,
  onToggle,
  onEdit,
  onDelete,
}: TransactionRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => e.key === "Enter" && onToggle()}
      aria-pressed={selected}
      aria-label={`${t.label}, $${t.amount}. ${selected ? "Selected" : "Not selected"}`}
      className={`border rounded-xl p-3 shadow-sm flex items-center justify-between gap-4 cursor-pointer transition-colors ${
        selected
          ? "bg-[#6B7C3A] border-[#8a9e4a] text-white"
          : "bg-orange-500 border-orange-400 text-white"
      }`}
    >
      {/* Label + date */}
      <div className="flex flex-col min-w-0">
        <h3 className="font-black truncate">{t.label}</h3>
        <p className={`text-[10px] font-bold uppercase ${selected ? "text-[#c8db7a]" : "text-orange-200"}`}>
          {t.date}
        </p>
      </div>

      {/* Amount + actions — stop propagation so clicks here don't toggle selection */}
      <div
        className="flex items-center gap-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-black text-lg">${t.amount}</span>
        <button
          onClick={onEdit}
          className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
            selected
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-white/90 text-orange-600 hover:bg-white"
          }`}
          aria-label={`Edit ${t.label}`}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-white/70 hover:text-white transition"
          aria-label={`Delete ${t.label}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}