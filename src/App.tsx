import { useState, useEffect, useCallback } from "react";
import type { FormEvent, KeyboardEvent } from "react";
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
  
  // Tab State
  const [activeTab, setActiveTab] = useState<"budget" | "transactions">("transactions");

  // Budget states
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemAmount, setNewItemAmount] = useState<number | "">("");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);

  const [totalIncome, setTotalIncome] = useState(6000); // Default to 6000
  const [tempIncome, setTempIncome] = useState<number | "">(6000);
  
  // App Lock State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  // UI Messages State (Replaces pop-ups)
  const [newArchiveName, setNewArchiveName] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // 1. Read: Listen for real-time updates from Budget Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "budget"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as BudgetItem[];
      
      data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setItems(data);
    });
    return () => unsubscribe();
  }, []);

  // 1b. Read: Listen for real-time updates from Transactions Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "transactions"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TransactionItem[];
      
      setTransactions(data);
    });
    return () => unsubscribe();
  }, []);

  // Read Archives
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "archives"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as MonthlyArchive[];
      setArchives(data);
    });
    return () => unsubscribe();
  }, []);

  // Read Income
  useEffect(() => {
    const fetchIncome = async () => {
      try {
        const docRef = doc(db, "settings", "monthlyIncome");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTotalIncome(data.amount);
          setTempIncome(data.amount);
        }
      } catch (e) {
        console.error("Error reading income: ", e);
      }
    };
    fetchIncome();
  }, []);

  // PIN Actions and Keypad events
  const handleDigit = useCallback((digit: string) => {
    if (pinInput.length < 4) {
      setPinInput((prev) => prev + digit);
    }
  }, [pinInput]);

  const handleDelete = useCallback(() => {
    setPinInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPinInput("");
  }, []);

  // 2. Auto Unlock Mechanism
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
      } else if (e.key === "Enter") {
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isUnlocked, handleDigit, pinInput, handleDelete]);

  const saveIncome = async () => {
    try {
      if (tempIncome !== "") {
        await setDoc(doc(db, "settings", "monthlyIncome"), { amount: Number(tempIncome) });
        setTotalIncome(Number(tempIncome));
      }
    } catch (e) {
      console.error("Error updating income: ", e);
    }
  };

  // Archive functionality: Archives transactions only and deletes active transactions, budget remains intact
  const archiveCurrentMonth = async () => {
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
      // 1. Save data to archives
      await addDoc(collection(db, "archives"), archiveData);

      // 2. Clear active transactions in Firestore
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
  };

  // Delete Archive Functionality
  const deleteArchive = async (id: string) => {
    try {
      await deleteDoc(doc(db, "archives", id));
      setStatusMsg("Archive deleted successfully.");
      setErrorMsg("");
    } catch (err) {
      console.error("Error deleting archive:", err);
      setErrorMsg("Failed to delete archive.");
      setStatusMsg("");
    }
  };

  // Restore functionality
  const restoreMonth = async (archive: MonthlyArchive) => {
    try {
      // 1. Clear current active transactions
      const transSnapshot = await getDocs(collection(db, "transactions"));
      for (const docSnap of transSnapshot.docs) {
        await deleteDoc(doc(db, "transactions", docSnap.id));
      }

      // 2. Restore transactions from the archive
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
  };

  // 3. Create or Update Item
  const addItem = async (e: FormEvent) => {
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
        paid: false
      });
    }

    setNewItemLabel("");
    setNewItemAmount("");
  };

  // 5. Delete: Remove a field
  const deleteItem = async (id: string) => {
    await deleteDoc(doc(db, "budget", id));
  };

  // 6. Reorder: Move Items Up and Down
  const moveUp = async (index: number) => {
    if (index === 0) return;
    const currentItem = items[index];
    const prevItem = items[index - 1];

    await updateDoc(doc(db, "budget", currentItem.id), { order: prevItem.order ?? index - 1 });
    await updateDoc(doc(db, "budget", prevItem.id), { order: currentItem.order ?? index });
  };

  const constDown = async (index: number) => {
    if (index === items.length - 1) return;
    const currentItem = items[index];
    const nextItem = items[index + 1];

    await updateDoc(doc(db, "budget", currentItem.id), { order: nextItem.order ?? index + 1 });
    await updateDoc(doc(db, "budget", nextItem.id), { order: currentItem.order ?? index });
  };

  // 7. Paid Checkbox Handler
  const togglePaid = async (id: string, currentPaid: boolean) => {
    await updateDoc(doc(db, "budget", id), { paid: !currentPaid });
  };

  const totalActual = items.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
  const totalTransactions = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const remainingBudget = totalIncome - totalActual - totalTransactions;

  const scrollToForm = () => {
    const el = document.getElementById("budget-form");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Render Lock Screen if not unlocked
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
                  idx < pinInput.length 
                    ? "bg-pink-600" 
                    : "bg-gray-200 border border-gray-300"
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
          
          {pinError && (
            <p className="text-orange-500 text-sm font-medium animate-pulse">{pinError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen p-4 md:p-8 font-sans" 
      style={{ backgroundColor: "#E6007E" }}
    >
      <div className="max-w-2xl mx-auto">
        
        {/* Inline Status and Error Messages */}
        {statusMsg && (
          <div className="mb-6 p-4 bg-green-600 border border-green-500 text-white font-semibold text-center rounded-xl shadow-md">
            {statusMsg}
            <button 
              onClick={() => setStatusMsg("")}
              className="float-right font-black hover:text-green-200"
            >
              ✕
            </button>
          </div>
        )}
        {errorMsg && (
          <div className="mb-6 p-4 bg-orange-600 border border-orange-500 text-white font-semibold text-center rounded-xl shadow-md">
            {errorMsg}
            <button 
              onClick={() => setErrorMsg("")}
              className="float-right font-black hover:text-orange-200"
            >
              ✕
            </button>
          </div>
        )}

        <header className="mb-8 border-b border-pink-400 pb-6 flex justify-between items-start flex-wrap gap-4">
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
                  className="text-xs bg-green-600 text-white px-3 py-1 rounded font-semibold hover:bg-green-700 transition shadow-sm"
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
                        ? 'bg-green-300 border-green-500' 
                        : 'bg-orange-500 border-orange-400'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input 
                        type="checkbox" 
                        checked={item.paid || false}
                        onChange={() => togglePaid(item.id, !!item.paid)}
                        className="h-5 w-5 rounded border-gray-400 text-green-600 focus:ring-pink-500 cursor-pointer flex-shrink-0"
                        title="Mark as paid"
                      />
                      <div className="flex flex-col gap-0.5 select-none flex-shrink-0">
                        <button 
                          onClick={() => moveUp(index)} 
                          disabled={index === 0}
                          className={`text-[9px] leading-none p-0.5 ${item.paid ? 'text-green-700/60 hover:text-green-900' : 'text-orange-200/80 hover:text-white'} disabled:opacity-30`}
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button 
                          onClick={() => constDown(index)} 
                          disabled={index === items.length - 1}
                          className={`text-[9px] leading-none p-0.5 ${item.paid ? 'text-green-700/60 hover:text-green-900' : 'text-orange-200/80 hover:text-white'} disabled:opacity-30`}
                          title="Move Down"
                        >
                          ▼
                        </button>
                      </div>

                      <div className="min-w-0">
                        <h3 className={`font-black truncate ${item.paid ? 'text-green-900' : 'text-white'}`}>
                          {item.label}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-black text-lg ${item.paid ? 'text-green-900' : 'text-white'}`}>
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
                            ? 'bg-green-700/20 text-green-900 hover:bg-green-700/30' 
                            : 'bg-white/90 text-orange-600 hover:bg-white'
                        }`}
                      >
                        Edit
                      </button>
                      
                      <button 
                        onClick={() => deleteItem(item.id)}
                        className={`hover:text-white/50 ${item.paid ? 'text-green-900/80 hover:text-green-900' : 'text-white/80'}`}
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

        {activeTab === "transactions" && (
          <TransactionsTab items={items} totalIncome={totalIncome} />
        )}

        {/* Summary totals section */}
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
              <p className={`text-3xl font-black mt-1 ${remainingBudget >= 0 ? 'text-green-300' : 'text-orange-400'}`}>
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
              className="text-xs bg-green-600 text-white px-3 py-2 rounded-lg border border-green-500 hover:bg-green-700 font-semibold transition shadow-sm"
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
                    <p className={`font-bold text-lg ${archive.remainingBudget >= 0 ? 'text-green-300' : 'text-orange-300'}`}>
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