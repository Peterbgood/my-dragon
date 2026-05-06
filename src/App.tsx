import { useState, useEffect, useCallback, useMemo, FormEvent, KeyboardEvent } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  getDocs
} from "firebase/firestore";
import { db } from "./firebase";
import TransactionsTab from "./TransactionsTab";

interface BudgetItem {
  id: string;
  label: string;
  actual: number;
  order?: number;
  paid?: boolean;
}

interface TransactionItem {
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

export default function App() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [archives, setArchives] = useState<MonthlyArchive[]>([]);

  const [activeTab, setActiveTab] = useState<"budget" | "transactions">("transactions");

  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemAmount, setNewItemAmount] = useState<number | "">("");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const [totalIncome, setTotalIncome] = useState(6000);
  const [tempIncome, setTempIncome] = useState<number | "">(6000);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const [newArchiveName, setNewArchiveName] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Budget Data Stream
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "budget"), (snapshot) => {
      const data: BudgetItem[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          label: d.label as string,
          actual: d.actual as number,
          order: d.order as number | undefined,
          paid: d.paid as boolean | undefined,
        };
      });
      data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setItems(data);
    });
    return () => unsubscribe();
  }, []);

  // Transaction Data Stream
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "transactions"), (snapshot) => {
      const data: TransactionItem[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          label: d.label as string,
          amount: d.amount as number,
          date: d.date as string,
        };
      });
      setTransactions(data);
    });
    return () => unsubscribe();
  }, []);

  // Archives Data Stream
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "archives"), (snapshot) => {
      const data: MonthlyArchive[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          monthYear: d.monthYear as string,
          items: d.items as BudgetItem[],
          transactions: d.transactions as TransactionItem[],
          totalIncome: d.totalIncome as number,
          totalActual: d.totalActual as number,
          totalTransactions: d.totalTransactions as number,
          remainingBudget: d.remainingBudget as number,
          archivedAt: d.archivedAt as string,
        };
      });
      setArchives(data);
    });
    return () => unsubscribe();
  }, []);

  // Income Settings Stream
  useEffect(() => {
    const fetchIncome = async () => {
      try {
        const docRef = doc(db, "settings", "monthlyIncome");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTotalIncome(data.amount as number);
          setTempIncome(data.amount as number);
        }
      } catch (e) {
        console.error("Error reading income: ", e);
      }
    };
    fetchIncome();
  }, []);

  // PIN Lock UI Handlers
  const handleDigit = useCallback((digit: string) => {
    setPinInput((prev) => (prev.length < 4 ? prev + digit : prev));
  }, []);

  const handleDelete = useCallback(() => {
    setPinInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPinInput("");
  }, []);

  useEffect(() => {
    if (pinInput.length === 4) {
      if (pinInput === "3270") {
        setIsUnlocked(true);
        setPinError("");
        setPinInput("");
      } else {
        setPinError("Incorrect PIN. Please try again.");
        setPinInput("");
      }
    }
  }, [pinInput]);

  // Desktop keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUnlocked) return;
      if (/^\d$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleDelete();
      } else if (e.key === "Enter" && pinInput.length === 4) {
        if (pinInput === "3270") {
          setIsUnlocked(true);
          setPinError("");
          setPinInput("");
        } else {
          setPinError("Incorrect PIN. Please try again.");
          setPinInput("");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown as any);
    return () => window.removeEventListener("keydown", handleKeyDown as any);
  }, [isUnlocked, handleDigit, pinInput, handleDelete]);

  // Operations
  const saveIncome = useCallback(async () => {
    try {
      if (tempIncome !== "") {
        await setDoc(doc(db, "settings", "monthlyIncome"), { amount: Number(tempIncome) });
        setTotalIncome(Number(tempIncome));
        setStatusMsg("Income updated successfully.");
        setErrorMsg("");
      }
    } catch (e) {
      console.error("Error updating income: ", e);
      setErrorMsg("Failed to update income.");
      setStatusMsg("");
    }
  }, [tempIncome]);

  const archiveCurrentMonth = useCallback(async () => {
    if (!newArchiveName.trim()) {
      setErrorMsg("Please enter an archive identifier before archiving.");
      setStatusMsg("");
      return;
    }

    const totalActualSum = items.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
    const totalTransactionsSum = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const remainingBudget = totalIncome - totalActualSum - totalTransactionsSum;

    const archiveData: Omit<MonthlyArchive, 'id'> = {
      monthYear: newArchiveName,
      items,
      transactions,
      totalIncome,
      totalActual: totalActualSum,
      totalTransactions: totalTransactionsSum,
      remainingBudget,
      archivedAt: new Date().toISOString(),
    };

    try {
      await addDoc(collection(db, "archives"), archiveData);

      const transSnapshot = await getDocs(collection(db, "transactions"));
      for (const docSnap of transSnapshot.docs) {
        await deleteDoc(doc(db, "transactions", docSnap.id));
      }

      setStatusMsg(`Successfully archived the month of ${newArchiveName}!`);
      setErrorMsg("");
      setNewArchiveName("");
    } catch (err) {
      console.error("Error archiving month:", err);
      setErrorMsg("Failed to archive the month.");
      setStatusMsg("");
    }
  }, [newArchiveName, items, transactions, totalIncome]);

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
      const transSnapshot = await getDocs(collection(db, "transactions"));
      for (const docSnap of transSnapshot.docs) {
        await deleteDoc(doc(db, "transactions", docSnap.id));
      }

      for (const t of archive.transactions) {
        await addDoc(collection(db, "transactions"), {
          label: t.label,
          amount: t.amount,
          date: t.date,
        });
      }

      setStatusMsg(`Successfully restored transactions for ${archive.monthYear}!`);
      setErrorMsg("");
    } catch (err) {
      console.error("Error restoring month:", err);
      setErrorMsg("Failed to restore the month.");
      setStatusMsg("");
    }
  }, []);

  const addItem = useCallback(async (e: FormEvent) => {
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
  }, [newItemLabel, newItemAmount, editingBudgetId, items]);

  const deleteItem = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "budget", id));
  }, []);

  const moveUp = useCallback(async (index: number) => {
    if (index === 0) return;
    const currentItem = items[index];
    const prevItem = items[index - 1];

    await updateDoc(doc(db, "budget", currentItem.id), { order: prevItem.order ?? index - 1 });
    await updateDoc(doc(db, "budget", prevItem.id), { order: currentItem.order ?? index });
  }, [items]);

  const moveDown = useCallback(async (index: number) => {
    if (index === items.length - 1) return;
    const currentItem = items[index];
    const nextItem = items[index + 1];

    await updateDoc(doc(db, "budget", currentItem.id), { order: nextItem.order ?? index + 1 });
    await updateDoc(doc(db, "budget", nextItem.id), { order: currentItem.order ?? index });
  }, [items]);

  const togglePaid = useCallback(async (id: string, currentPaid: boolean) => {
    await updateDoc(doc(db, "budget", id), { paid: !currentPaid });
  }, []);

  const totalActual = useMemo(() => items.reduce((sum, item) => sum + (Number(item.actual) || 0), 0), [items]);
  const totalTransactions = useMemo(() => transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0), [transactions]);
  const remainingBudget = useMemo(() => totalIncome - totalActual - totalTransactions, [totalIncome, totalActual, totalTransactions]);

  const scrollToForm = useCallback(() => {
    const el = document.getElementById("budget-form");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "#E6007E" }}>
        <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-md border border-gray-100 flex flex-col items-center text-center">
          <h1 className="text-3xl font-black text-pink-600 italic tracking-wider mb-2">MY DRAGON</h1>
          <p className="text-gray-500 text-sm pb-8">Enter your 4-digit PIN to access budget</p>

          <div className="flex gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  idx < pinInput.length ? "bg-pink-600" : "bg-gray-200 border border-gray-300"
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 w-full mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handleDigit(num.toString())}
                className="h-12 bg-gray-50 hover:bg-gray-100 text-gray-800 text-xl font-black rounded-xl flex items-center justify-center transition border border-gray-300 shadow-sm"
              >
                {num}
              </button>
            ))}

            <button
              onClick={handleClear}
              className="h-12 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-black rounded-xl flex items-center justify-center transition shadow-sm"
            >
              CLEAR
            </button>

            <button
              onClick={() => handleDigit("0")}
              className="h-12 bg-gray-50 hover:bg-gray-100 text-gray-800 text-xl font-black rounded-xl flex items-center justify-center transition border border-gray-300 shadow-sm"
            >
              0
            </button>

            <button
              onClick={handleDelete}
              className="h-12 bg-gray-200 hover:bg-gray-300 text-gray-700 text-lg font-black rounded-xl flex items-center justify-center transition shadow-sm"
            >
              ⌫
            </button>
          </div>

          {pinError && <p className="text-orange-500 text-sm font-medium animate-pulse">{pinError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans" style={{ backgroundColor: "#E6007E" }}>
      <div className="max-w-2xl mx-auto">
        {statusMsg && (
          <div className="mb-6 p-4 bg-lime-800 border border-lime-600 text-white font-semibold text-center rounded-xl shadow-md flex justify-between items-center">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg("")} className="font-black hover:text-lime-200">✕</button>
          </div>
        )}
        {errorMsg && (
          <div className="mb-6 p-4 bg-orange-600 border border-orange-500 text-white font-semibold text-center rounded-xl shadow-md flex justify-between items-center">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} className="font-black hover:text-orange-200">✕</button>
          </div>
        )}

        <header className="mb-8 border-b border-pink-400 pb-6 flex justify-between items-center flex-wrap gap-4">
          <div>
            <p className="text-pink-100 text-sm mt-1 text-center">Monthly Budget Strategy</p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <button
              onClick={() => setIsUnlocked(false)}
              className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg border border-gray-600 hover:bg-gray-900 font-semibold transition shadow-sm w-fit"
            >
              Lock App
            </button>
          </div>
        </header>

        {/* Tab Switcher */}
        <div className="flex justify-center gap-3 mb-8">
          <button
            onClick={() => setActiveTab("budget")}
            className={`px-6 py-3 rounded-lg font-extrabold text-sm transition shadow-md ${
              activeTab === "budget"
                ? "bg-orange-500 text-white border border-orange-400"
                : "bg-white/10 text-white hover:bg-white/20 border border-pink-400/30"
            }`}
          >
            Budget
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`px-6 py-3 rounded-lg font-extrabold text-sm transition shadow-md ${
              activeTab === "transactions"
                ? "bg-orange-500 text-white border border-orange-400"
                : "bg-white/10 text-white hover:bg-white/20 border border-pink-400/30"
            }`}
          >
            Transactions
          </button>
        </div>

        {/* Centered Component */}
        <div className="flex justify-center mt-6 mb-8">
          <div className="p-4 bg-orange-500 rounded-lg border border-orange-400 text-center w-full max-w-sm shadow-md">
            <label className="block text-xs uppercase font-bold text-orange-200 mb-1">
              {activeTab === "budget" ? "Total Income" : "Budget Remaining"}
            </label>
            <div className="flex items-center justify-center text-3xl font-extrabold text-white">
              <span className="mr-1 text-orange-300">$</span>
              {activeTab === "budget" ? (
                <input
                  type="number"
                  value={tempIncome}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTempIncome(val === "" ? "" : Number(val));
                  }}
                  className="w-36 bg-transparent border-b-2 border-transparent focus:border-orange-300 focus:outline-none text-center font-extrabold text-white"
                />
              ) : (
                <span>{totalIncome - totalActual}</span>
              )}
            </div>

            {activeTab === "budget" && tempIncome !== totalIncome && (
              <div className="mt-2 flex justify-center">
                <button
                  onClick={saveIncome}
                  className="text-xs bg-lime-800 text-white px-3 py-1 rounded font-semibold hover:bg-lime-900 transition shadow-sm"
                >
                  Save Income
                </button>
              </div>
            )}
          </div>
        </div>

        {activeTab === "budget" && (
          <>
            {/* Add/Edit Form */}
            <form id="budget-form" onSubmit={addItem} className="mb-8 flex gap-3 flex-col sm:flex-row">
              <input
                type="text"
                placeholder="e.g., Mortgage, Gas, Groceries"
                className="flex-1 p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
              />
              <input
                type="number"
                placeholder="Amount ($)"
                className="p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800 w-full sm:w-40"
                value={newItemAmount}
                onChange={(e) => setNewItemAmount(Number(e.target.value))}
              />
              <button className="bg-orange-500 text-white px-5 py-3 rounded-lg font-bold hover:bg-orange-600 transition shadow-sm w-full sm:w-auto">
                {editingBudgetId ? "SAVE" : "+ ADD FIELD"}
              </button>
              {editingBudgetId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBudgetId(null);
                    setNewItemLabel("");
                    setNewItemAmount("");
                  }}
                  className="bg-gray-500 text-white px-5 py-3 rounded-lg font-bold hover:bg-gray-600 transition shadow-sm w-full sm:w-auto"
                >
                  Cancel
                </button>
              )}
            </form>

            <div className="space-y-4">
              {items.length === 0 ? (
                <div className="p-12 text-center text-white bg-white/10 rounded-2xl border border-pink-400">
                  <p className="font-bold opacity-80 uppercase tracking-widest">No budget fields yet</p>
                </div>
              ) : (
                items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 border rounded-xl shadow-sm gap-4 transition-colors ${
                      item.paid
                        ? "bg-lime-800 border-lime-600 text-white"
                        : "bg-orange-500 border-orange-400 text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={item.paid || false}
                        onChange={() => togglePaid(item.id, !!item.paid)}
                        className="h-5 w-5 rounded border-gray-400 text-lime-600 focus:ring-pink-500 cursor-pointer flex-shrink-0"
                        title="Mark as paid"
                      />
                      <div className="flex flex-col gap-0.5 select-none flex-shrink-0">
                        <button
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className={`text-[9px] leading-none p-0.5 ${
                            item.paid ? "text-lime-300 hover:text-white" : "text-orange-200/80 hover:text-white"
                          } disabled:opacity-30`}
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveDown(index)}
                          disabled={index === items.length - 1}
                          className={`text-[9px] leading-none p-0.5 ${
                            item.paid ? "text-lime-300 hover:text-white" : "text-orange-200/80 hover:text-white"
                          } disabled:opacity-30`}
                          title="Move Down"
                        >
                          ▼
                        </button>
                      </div>

                      <div className="min-w-0">
                        <h3 className={`font-black truncate ${item.paid ? "text-lime-100" : "text-white"}`}>
                          {item.label}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-black text-lg ${item.paid ? "text-lime-200" : "text-white"}`}>
                        ${item.actual}
                      </span>
                      <button
                        onClick={() => {
                          setEditingBudgetId(item.id);
                          setNewItemLabel(item.label);
                          setNewItemAmount(item.actual);
                          scrollToForm();
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                          item.paid
                            ? "bg-lime-900/40 text-lime-100 hover:bg-lime-900/60"
                            : "bg-white/90 text-orange-600 hover:bg-white"
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className={`hover:text-white/50 ${item.paid ? "text-lime-200 hover:text-white" : "text-white/80"}`}
                        title="Remove Category"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === "transactions" && <TransactionsTab items={items} totalIncome={totalIncome} />}

        {/* Summary Totals Section */}
        <div className="mt-8 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-orange-500 p-5 rounded-lg border border-orange-400">
            <div>
              <p className="text-xs font-bold text-orange-200 uppercase">Total Bill Amount</p>
              <p className="text-3xl font-black text-white mt-1">
                ${totalActual}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-orange-200 uppercase">Budget Remaining</p>
              <p className="text-3xl font-black text-white mt-1">
                ${totalIncome - totalActual}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-orange-500 p-5 rounded-lg border border-orange-400">
            <div>
              <p className="text-xs font-bold text-orange-200 uppercase">Total Transactions</p>
              <p className="text-3xl font-black text-white mt-1">
                ${totalTransactions}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-orange-200 uppercase">Final Remaining</p>
              <p className={`text-3xl font-black mt-1 ${remainingBudget >= 0 ? "text-lime-200" : "text-orange-400"}`}>
                ${remainingBudget}
              </p>
            </div>
          </div>
        </div>

        {/* Monthly Archives Section */}
        <div className="mt-12 border-t border-pink-400 pt-8 space-y-6">
          <h2 className="text-2xl font-black text-white">Monthly Archives</h2>

          <div className="flex gap-2 items-center flex-wrap bg-white/10 p-4 rounded-xl border border-pink-400/30">
            <input
              type="text"
              placeholder="Archive name (e.g., 2026-05)"
              className="text-xs p-2 rounded-lg border border-pink-300 text-gray-800 w-44 bg-white"
              value={newArchiveName}
              onChange={(e) => setNewArchiveName(e.target.value)}
            />
            <button
              onClick={archiveCurrentMonth}
              className="text-xs bg-lime-800 text-white px-3 py-2 rounded-lg border border-lime-600 hover:bg-lime-900 font-semibold transition shadow-sm"
            >
              Archive Month
            </button>
          </div>

          {archives.length === 0 ? (
            <p className="text-orange-200 text-center py-6 bg-white/10 rounded-xl border border-pink-400">
              No archived months found.
            </p>
          ) : (
            archives.map((archive) => (
              <div key={archive.id} className="bg-orange-500 border border-orange-400 rounded-2xl p-6 shadow-md text-white space-y-4">
                <div className="flex justify-between items-center border-b border-orange-400 pb-3">
                  <h3 className="text-xl font-black uppercase">Cycle: {archive.monthYear}</h3>
                  <span className="text-xs bg-orange-600 px-2 py-1 rounded">
                    Saved: {new Date(archive.archivedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-orange-200">Total Income</p>
                    <p className="font-bold text-lg">${archive.totalIncome}</p>
                  </div>
                  <div>
                    <p className="text-orange-200">Total Actual</p>
                    <p className="font-bold text-lg">${archive.totalActual}</p>
                  </div>
                  <div>
                    <p className="text-orange-200">Total Transactions</p>
                    <p className="font-bold text-lg">${archive.totalTransactions}</p>
                  </div>
                  <div>
                    <p className="text-orange-200">Remaining Budget</p>
                    <p className={`font-bold text-lg ${archive.remainingBudget >= 0 ? "text-lime-200" : "text-orange-300"}`}>
                      ${archive.remainingBudget}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2 border-t border-orange-400/30">
                  <button
                    onClick={() => restoreMonth(archive)}
                    className="text-xs bg-blue-600 text-white border border-blue-500 hover:bg-blue-700 px-3 py-1.5 rounded-lg font-semibold transition shadow-sm"
                  >
                    Restore Month
                  </button>
                  <button
                    onClick={() => deleteArchive(archive.id)}
                    className="text-xs bg-red-600 text-white border border-red-500 hover:bg-red-700 px-3 py-1.5 rounded-lg font-semibold transition shadow-sm"
                  >
                    Delete Archive
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}