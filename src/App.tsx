import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import TransactionsTab from "./TransactionsTab";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BudgetItem {
  id: string;
  label: string;
  actual: number;
  order: number;
  paid: boolean;
}

export interface TransactionItem {
  id: string;
  label: string;
  amount: number;
  date: string;
}

interface MonthlyArchive {
  id: string;
  monthYear: string;
  items: BudgetItem[];
  transactions: TransactionItem[];
  totalIncome: number;
  totalActual: number;
  totalTransactions: number;
  remainingBudget: number;
  archivedAt: string;
}

type ActiveTab = "budget" | "transactions";

// ─── Firestore helpers ────────────────────────────────────────────────────────

/** Maps a Firestore snapshot doc to a typed object. */
function fromDoc<T extends { id: string }>(
  d: import("firebase/firestore").QueryDocumentSnapshot
): T {
  return { id: d.id, ...d.data() } as T;
}

// ─── PIN ──────────────────────────────────────────────────────────────────────

const CORRECT_PIN = "3270";

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  // ── Firestore state ──
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [archives, setArchives] = useState<MonthlyArchive[]>([]);
  const [totalIncome, setTotalIncome] = useState(6000);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<ActiveTab>("transactions");
  const [tempIncome, setTempIncome] = useState<number | "">(6000);

  // ── Budget form state ──
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemAmount, setNewItemAmount] = useState<number | "">("");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  // ── Archive state ──
  const [newArchiveName, setNewArchiveName] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // ── PIN / lock state ──
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  // ── Real-time listeners ───────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "budget"), (snap) => {
      const data = snap.docs
        .map((d) => fromDoc<BudgetItem>(d))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setItems(data);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "transactions"), (snap) => {
      setTransactions(snap.docs.map((d) => fromDoc<TransactionItem>(d)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "archives"), (snap) => {
      setArchives(snap.docs.map((d) => fromDoc<MonthlyArchive>(d)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "monthlyIncome"));
        if (snap.exists()) {
          const amount = (snap.data() as { amount: number }).amount;
          setTotalIncome(amount);
          setTempIncome(amount);
        }
      } catch (err) {
        console.error("Error reading income:", err);
      }
    })();
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const totalActual = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.actual) || 0), 0),
    [items]
  );

  const totalTransactions = useMemo(
    () => transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    [transactions]
  );

  const remainingBudget = useMemo(
    () => totalIncome - totalActual - totalTransactions,
    [totalIncome, totalActual, totalTransactions]
  );

  // ── PIN logic ─────────────────────────────────────────────────────────────

  const attemptUnlock = useCallback((pin: string) => {
    if (pin === CORRECT_PIN) {
      setIsUnlocked(true);
      setPinError("");
    } else {
      setPinError("Incorrect PIN. Please try again.");
    }
    setPinInput("");
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pinInput.length >= 4) return;
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === 4) attemptUnlock(next);
    },
    [pinInput, attemptUnlock]
  );

  const handleDelete = useCallback(() => setPinInput((p) => p.slice(0, -1)), []);
  const handleClear = useCallback(() => setPinInput(""), []);

  // Desktop keyboard handler
  useEffect(() => {
    if (isUnlocked) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) handleDigit(e.key);
      else if (e.key === "Backspace") handleDelete();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isUnlocked, handleDigit, handleDelete]);

  // ── Income ────────────────────────────────────────────────────────────────

  const saveIncome = useCallback(async () => {
    if (tempIncome === "") return;
    try {
      const amount = Number(tempIncome);
      await setDoc(doc(db, "settings", "monthlyIncome"), { amount });
      setTotalIncome(amount);
    } catch (err) {
      console.error("Error updating income:", err);
    }
  }, [tempIncome]);

  // ── Budget CRUD ───────────────────────────────────────────────────────────

  const addItem = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newItemLabel.trim()) return;

      if (editingBudgetId) {
        await updateDoc(doc(db, "budget", editingBudgetId), {
          label: newItemLabel,
          actual: Number(newItemAmount) || 0,
        });
        setEditingBudgetId(null);
      } else {
        await addDoc(collection(db, "budget"), {
          label: newItemLabel,
          actual: Number(newItemAmount) || 0,
          order: items.length,
          paid: false,
        });
      }

      setNewItemLabel("");
      setNewItemAmount("");
    },
    [editingBudgetId, newItemLabel, newItemAmount, items.length]
  );

  const deleteItem = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "budget", id));
  }, []);

  const togglePaid = useCallback(async (id: string, currentPaid: boolean) => {
    await updateDoc(doc(db, "budget", id), { paid: !currentPaid });
  }, []);

  const moveUp = useCallback(
    async (index: number) => {
      if (index === 0) return;
      const cur = items[index];
      const prev = items[index - 1];
      await Promise.all([
        updateDoc(doc(db, "budget", cur.id), { order: prev.order ?? index - 1 }),
        updateDoc(doc(db, "budget", prev.id), { order: cur.order ?? index }),
      ]);
    },
    [items]
  );

  const moveDown = useCallback(
    async (index: number) => {
      if (index === items.length - 1) return;
      const cur = items[index];
      const next = items[index + 1];
      await Promise.all([
        updateDoc(doc(db, "budget", cur.id), { order: next.order ?? index + 1 }),
        updateDoc(doc(db, "budget", next.id), { order: cur.order ?? index }),
      ]);
    },
    [items]
  );

  // ── Archive logic ─────────────────────────────────────────────────────────

  const archiveCurrentMonth = useCallback(async () => {
    if (!newArchiveName.trim()) {
      setErrorMsg("Please enter an archive identifier before archiving.");
      setStatusMsg("");
      return;
    }

    const archiveData: Omit<MonthlyArchive, "id"> = {
      monthYear: newArchiveName,
      items,
      transactions,
      totalIncome,
      totalActual,
      totalTransactions,
      remainingBudget,
      archivedAt: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, "archives"), archiveData);

      const transSnap = await getDocs(collection(db, "transactions"));
      await Promise.all(
        transSnap.docs.map((d) => deleteDoc(doc(db, "transactions", d.id)))
      );

      setStatusMsg(`Successfully archived ${newArchiveName}!`);
      setErrorMsg("");
      setNewArchiveName("");
    } catch (err) {
      console.error("Error archiving month:", err);
      setErrorMsg("Failed to archive the month.");
      setStatusMsg("");
    }
  }, [
    newArchiveName,
    items,
    transactions,
    totalIncome,
    totalActual,
    totalTransactions,
    remainingBudget,
  ]);

  const deleteArchive = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, "archives", id));
      setStatusMsg("Archive deleted successfully.");
      setErrorMsg("");
    } catch (err) {
      console.error("Error deleting archive:", err);
      setErrorMsg("Failed to delete archive.");
      setStatusMsg("");
    }
  }, []);

  const restoreMonth = useCallback(async (archive: MonthlyArchive) => {
    try {
      const transSnap = await getDocs(collection(db, "transactions"));
      await Promise.all(
        transSnap.docs.map((d) => deleteDoc(doc(db, "transactions", d.id)))
      );

      await Promise.all(
        archive.transactions.map((t) =>
          addDoc(collection(db, "transactions"), {
            label: t.label,
            amount: t.amount,
            date: t.date,
          })
        )
      );

      setStatusMsg(`Restored transactions for ${archive.monthYear}!`);
      setErrorMsg("");
    } catch (err) {
      console.error("Error restoring month:", err);
      setErrorMsg("Failed to restore the month.");
      setStatusMsg("");
    }
  }, []);

  // ── Scroll helper ─────────────────────────────────────────────────────────

  const scrollToForm = useCallback((formId: string) => {
    document.getElementById(formId)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ─── Lock screen ──────────────────────────────────────────────────────────

  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#E6007E]">
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center text-center">
          <h1 className="text-3xl font-black text-pink-600 italic tracking-wider mb-2">
            MY DRAGON
          </h1>
          <p className="text-gray-400 text-sm pb-8">Enter your 4-digit PIN</p>

          {/* PIN dots */}
          <div className="flex gap-4 mb-8" role="status" aria-label={`${pinInput.length} digits entered`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  i < pinInput.length
                    ? "bg-pink-600 scale-110"
                    : "bg-gray-200 border border-gray-300"
                }`}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3 w-full mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleDigit(num.toString())}
                className="h-14 bg-gray-50 hover:bg-pink-50 active:bg-pink-100 text-gray-800 text-xl font-black rounded-xl flex items-center justify-center transition border border-gray-200 shadow-sm"
                aria-label={`Digit ${num}`}
              >
                {num}
              </button>
            ))}
            <button
              onClick={handleClear}
              className="h-14 bg-gray-100 hover:bg-gray-200 text-gray-500 text-xs font-black rounded-xl flex items-center justify-center transition shadow-sm"
              aria-label="Clear PIN"
            >
              CLEAR
            </button>
            <button
              onClick={() => handleDigit("0")}
              className="h-14 bg-gray-50 hover:bg-pink-50 active:bg-pink-100 text-gray-800 text-xl font-black rounded-xl flex items-center justify-center transition border border-gray-200 shadow-sm"
              aria-label="Digit 0"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="h-14 bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg font-black rounded-xl flex items-center justify-center transition shadow-sm"
              aria-label="Delete last digit"
            >
              ⌫
            </button>
          </div>

          {pinError && (
            <p role="alert" className="text-orange-500 text-sm font-semibold animate-pulse">
              {pinError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Main app ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans bg-[#E6007E]">
      <div className="max-w-2xl mx-auto">

        {/* Status / Error banners */}
        {statusMsg && (
          <div className="mb-6 p-4 bg-[#6B7C3A] border border-[#8a9e4a] text-white font-semibold text-center rounded-xl shadow-md flex justify-between items-center">
            <span>{statusMsg}</span>
            <button
              onClick={() => setStatusMsg("")}
              className="ml-4 font-black hover:text-white/70"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {errorMsg && (
          <div className="mb-6 p-4 bg-orange-700 border border-orange-500 text-white font-semibold text-center rounded-xl shadow-md flex justify-between items-center">
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg("")}
              className="ml-4 font-black hover:text-white/70"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <header className="mb-8 border-b border-pink-400 pb-6 flex justify-between items-center flex-wrap gap-4">
          <p className="text-pink-100 text-sm uppercase tracking-widest font-bold">
            Monthly Budget Strategy
          </p>
          <button
            onClick={() => setIsUnlocked(false)}
            className="text-xs bg-gray-900/60 text-white px-3 py-1.5 rounded-lg border border-gray-600 hover:bg-gray-900 font-semibold transition shadow-sm"
          >
            Lock App
          </button>
        </header>

        {/* Tab switcher */}
        <div className="flex justify-center gap-3 mb-8">
          {(["budget", "transactions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-xl font-extrabold text-sm uppercase tracking-wide transition shadow-md ${
                activeTab === tab
                  ? "bg-white text-pink-600 border border-white"
                  : "bg-white/10 text-white hover:bg-white/20 border border-pink-300/30"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Income / Remaining card */}
        <div className="flex justify-center mb-8">
          <div className="p-5 bg-white/10 border border-pink-300/40 rounded-2xl text-center w-full max-w-sm shadow-inner backdrop-blur-sm">
            <label className="block text-xs uppercase font-bold text-pink-200 mb-1 tracking-wider">
              {activeTab === "budget" ? "Total Income" : "Budget Remaining"}
            </label>
            <div className="flex items-center justify-center text-3xl font-extrabold text-white">
              <span className="mr-1 text-pink-300">$</span>
              {activeTab === "budget" ? (
                <input
                  type="number"
                  value={tempIncome}
                  onChange={(e) =>
                    setTempIncome(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="w-36 bg-transparent border-b-2 border-transparent focus:border-pink-300 focus:outline-none text-center font-extrabold text-white"
                  aria-label="Total income"
                />
              ) : (
                <span>{totalIncome - totalActual}</span>
              )}
            </div>
            {activeTab === "budget" && tempIncome !== totalIncome && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={saveIncome}
                  className="text-xs bg-[#6B7C3A] hover:bg-[#5a6930] text-white px-4 py-1.5 rounded-lg font-semibold transition shadow-sm"
                >
                  Save Income
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Budget Tab ── */}
        {activeTab === "budget" && (
          <>
            <form
              id="budget-form"
              onSubmit={addItem}
              className="mb-8 flex gap-3 flex-col sm:flex-row"
            >
              <input
                type="text"
                placeholder="e.g., Mortgage, Gas, Groceries"
                className="flex-1 p-3 border border-pink-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                aria-label="Budget category label"
              />
              <input
                type="number"
                placeholder="Amount ($)"
                className="p-3 border border-pink-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800 w-full sm:w-40"
                value={newItemAmount}
                onChange={(e) => setNewItemAmount(Number(e.target.value) || "")}
                aria-label="Budget amount"
              />
              <button className="bg-orange-500 text-white px-5 py-3 rounded-xl font-bold hover:bg-orange-600 transition shadow-sm w-full sm:w-auto">
                {editingBudgetId ? "SAVE" : "+ ADD"}
              </button>
              {editingBudgetId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBudgetId(null);
                    setNewItemLabel("");
                    setNewItemAmount("");
                  }}
                  className="bg-gray-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-gray-700 transition shadow-sm w-full sm:w-auto"
                >
                  Cancel
                </button>
              )}
            </form>

            <div className="space-y-3">
              {items.length === 0 ? (
                <div className="p-12 text-center text-white bg-white/10 rounded-2xl border border-pink-400/40">
                  <p className="font-bold opacity-70 uppercase tracking-widest text-sm">
                    No budget fields yet
                  </p>
                </div>
              ) : (
                items.map((item, index) => (
                  <BudgetRow
                    key={item.id}
                    item={item}
                    index={index}
                    isLast={index === items.length - 1}
                    onMoveUp={() => moveUp(index)}
                    onMoveDown={() => moveDown(index)}
                    onTogglePaid={() => togglePaid(item.id, item.paid)}
                    onEdit={() => {
                      setEditingBudgetId(item.id);
                      setNewItemLabel(item.label);
                      setNewItemAmount(item.actual);
                      scrollToForm("budget-form");
                    }}
                    onDelete={() => deleteItem(item.id)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* ── Transactions Tab ── */}
        {activeTab === "transactions" && (
          <TransactionsTab items={items} totalIncome={totalIncome} />
        )}

        {/* ── Summary ── */}
        <div className="mt-10 space-y-4">
          <div className="grid grid-cols-2 gap-4 bg-white/10 border border-pink-300/30 p-5 rounded-2xl backdrop-blur-sm">
            <SummaryCell label="Total Bills" value={totalActual} />
            <SummaryCell label="Budget Remaining" value={totalIncome - totalActual} signed />
          </div>
          <div className="grid grid-cols-2 gap-4 bg-white/10 border border-pink-300/30 p-5 rounded-2xl backdrop-blur-sm">
            <SummaryCell label="Total Transactions" value={totalTransactions} />
            <SummaryCell label="Final Remaining" value={remainingBudget} signed />
          </div>
        </div>

        {/* ── Monthly Archives ── */}
        <section className="mt-12 border-t border-pink-400/40 pt-8 space-y-6">
          <h2 className="text-2xl font-black text-white">Monthly Archives</h2>

          <div className="flex gap-2 items-center flex-wrap bg-white/10 p-4 rounded-xl border border-pink-400/20">
            <input
              type="text"
              placeholder="Archive name (e.g., 2026-05)"
              className="text-sm p-2 rounded-lg border border-pink-300 text-gray-800 w-44 bg-white"
              value={newArchiveName}
              onChange={(e) => setNewArchiveName(e.target.value)}
              aria-label="Archive name"
            />
            <button
              onClick={archiveCurrentMonth}
              className="text-sm bg-[#6B7C3A] hover:bg-[#5a6930] text-white px-4 py-2 rounded-lg border border-[#8a9e4a] font-semibold transition shadow-sm"
            >
              Archive Month
            </button>
          </div>

          {archives.length === 0 ? (
            <p className="text-pink-200 text-center py-6 bg-white/10 rounded-xl border border-pink-400/20 text-sm">
              No archived months found.
            </p>
          ) : (
            archives
              .slice()
              .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
              .map((archive) => (
                <ArchiveCard
                  key={archive.id}
                  archive={archive}
                  onRestore={() => restoreMonth(archive)}
                  onDelete={() => deleteArchive(archive.id)}
                />
              ))
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface BudgetRowProps {
  item: BudgetItem;
  index: number;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTogglePaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function BudgetRow({
  item,
  index,
  isLast,
  onMoveUp,
  onMoveDown,
  onTogglePaid,
  onEdit,
  onDelete,
}: BudgetRowProps) {
  const paid = item.paid;

  return (
    <div
      className={`flex items-center justify-between p-3 border rounded-xl shadow-sm gap-4 transition-colors ${
        paid
          ? "bg-[#6B7C3A] border-[#8a9e4a] text-white"
          : "bg-orange-500 border-orange-400 text-white"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <input
          type="checkbox"
          checked={paid}
          onChange={onTogglePaid}
          className="h-5 w-5 rounded border-gray-400 text-[#6B7C3A] focus:ring-pink-500 cursor-pointer flex-shrink-0 accent-[#6B7C3A]"
          title="Mark as paid"
          aria-label={`Mark ${item.label} as ${paid ? "unpaid" : "paid"}`}
        />
        <div className="flex flex-col select-none flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-[9px] leading-none p-0.5 text-white/70 hover:text-white disabled:opacity-25"
            title="Move up"
            aria-label="Move item up"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="text-[9px] leading-none p-0.5 text-white/70 hover:text-white disabled:opacity-25"
            title="Move down"
            aria-label="Move item down"
          >
            ▼
          </button>
        </div>
        <h3 className="font-black truncate">{item.label}</h3>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="font-black text-lg">${item.actual}</span>
        <button
          onClick={onEdit}
          className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
            paid
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-white/90 text-orange-600 hover:bg-white"
          }`}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-white/70 hover:text-white transition"
          title="Delete"
          aria-label={`Delete ${item.label}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

interface SummaryCellProps {
  label: string;
  value: number;
  signed?: boolean;
}

function SummaryCell({ label, value, signed = false }: SummaryCellProps) {
  const colorClass = signed
    ? value >= 0
      ? "text-[#b5cc6a]"
      : "text-orange-300"
    : "text-white";

  return (
    <div>
      <p className="text-xs font-bold text-pink-200 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-black mt-1 ${colorClass}`}>${value}</p>
    </div>
  );
}

interface ArchiveCardProps {
  archive: MonthlyArchive;
  onRestore: () => void;
  onDelete: () => void;
}

function ArchiveCard({ archive, onRestore, onDelete }: ArchiveCardProps) {
  return (
    <div className="bg-white/10 border border-pink-300/30 rounded-2xl p-6 shadow-md text-white space-y-4 backdrop-blur-sm">
      <div className="flex justify-between items-center border-b border-pink-300/20 pb-3">
        <h3 className="text-xl font-black uppercase tracking-wide">
          Cycle: {archive.monthYear}
        </h3>
        <span className="text-xs bg-white/10 border border-pink-300/20 px-2 py-1 rounded-lg text-pink-200">
          {new Date(archive.archivedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <ArchiveStat label="Total Income" value={archive.totalIncome} />
        <ArchiveStat label="Total Bills" value={archive.totalActual} />
        <ArchiveStat label="Transactions" value={archive.totalTransactions} />
        <ArchiveStat
          label="Remaining"
          value={archive.remainingBudget}
          signed
        />
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-pink-300/20">
        <button
          onClick={onRestore}
          className="text-xs bg-blue-700 hover:bg-blue-800 text-white border border-blue-500 px-3 py-1.5 rounded-lg font-semibold transition shadow-sm"
        >
          Restore Month
        </button>
        <button
          onClick={onDelete}
          className="text-xs bg-red-700 hover:bg-red-800 text-white border border-red-500 px-3 py-1.5 rounded-lg font-semibold transition shadow-sm"
        >
          Delete Archive
        </button>
      </div>
    </div>
  );
}

function ArchiveStat({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  const colorClass = signed
    ? value >= 0
      ? "text-[#b5cc6a] font-bold text-lg"
      : "text-orange-300 font-bold text-lg"
    : "font-bold text-lg";

  return (
    <div>
      <p className="text-pink-200 text-xs uppercase tracking-wide">{label}</p>
      <p className={colorClass}>${value}</p>
    </div>
  );
}