import { useState, useEffect } from "react";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  doc,
  getDoc,
  setDoc
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
  category: string;
  amount: number;
  date: string;
}

export default function App() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  
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

  // 3. Create or Update Item
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemLabel.trim()) return;
    
    if (editingBudgetId) {
      // Save changes to original field
      await updateDoc(doc(db, "budget", editingBudgetId), { 
        label: newItemLabel,
        actual: Number(newItemAmount) || 0,
      });
      setEditingBudgetId(null);
    } else {
      // Add new field
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

    const currentOrder = currentItem.order !== undefined ? currentItem.order : index;
    const prevOrder = prevItem.order !== undefined ? prevItem.order : index - 1;

    await updateDoc(doc(db, "budget", currentItem.id), { order: prevOrder });
    await updateDoc(doc(db, "budget", prevItem.id), { order: currentOrder });
  };

  const moveDown = async (index: number) => {
    if (index === items.length - 1) return;
    const currentItem = items[index];
    const nextItem = items[index + 1];

    const currentOrder = currentItem.order !== undefined ? currentItem.order : index;
    const nextOrder = nextItem.order !== undefined ? nextItem.order : index + 1;

    await updateDoc(doc(db, "budget", currentItem.id), { order: nextOrder });
    await updateDoc(doc(db, "budget", nextItem.id), { order: currentOrder });
  };

  // 7. Paid Checkbox Handler
  const togglePaid = async (id: string, currentPaid: boolean) => {
    await updateDoc(doc(db, "budget", id), { paid: !currentPaid });
  };

  const totalActual = items.reduce((sum, item) => sum + item.actual, 0);
  const totalTransactions = transactions.reduce((sum, t) => sum + t.amount, 0);
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
        <div className="bg-white p-8 rounded-2xl shadow-md border border-gray-100 max-w-sm w-full text-center">
          <h1 className="text-3xl font-black text-pink-600 italic tracking-wider mb-2">MY DRAGON</h1>
          <p className="text-gray-500 text-sm mb-6">Enter your 4-digit PIN to access budget</p>
          
          <div className="space-y-4">
            <div>
              <input 
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                autoFocus
                className="w-full p-4 text-center text-2xl tracking-widest border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 bg-gray-50"
              />
            </div>
            
            {pinError && (
              <p className="text-orange-500 text-sm font-medium animate-pulse">{pinError}</p>
            )}
          </div>
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
        <header className="mb-8 border-b border-pink-400 pb-6 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-black text-white italic tracking-wider">MY DRAGON</h1>
            <p className="text-pink-100 text-sm mt-1">Monthly Budget Strategy</p>
          </div>
          <button 
            onClick={() => setIsUnlocked(false)}
            className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg border border-gray-600 hover:bg-gray-900 font-semibold transition shadow-sm"
          >
            Lock App
          </button>
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
                className="flex-1 p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
              />
              <input 
                type="number" 
                placeholder="Amount ($)"
                className="p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white w-full sm:w-40"
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

            <div className="space-y-3">
              {items.length === 0 ? (
                <div className="p-12 text-center text-white bg-white/10 rounded-lg border border-pink-400">
                  <p className="font-medium text-white mb-1">No budget fields yet</p>
                </div>
              ) : (
                items.map((item, index) => (
                  <div 
                    key={item.id} 
                    className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg shadow-sm gap-4 transition-colors ${
                      item.paid 
                        ? 'bg-green-300 border-green-500' 
                        : 'bg-orange-500 border-orange-400'
                    }`}
                  >
                    <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
                      <div className="flex items-center gap-3">
                        {/* Paid Checkbox */}
                        <input 
                          type="checkbox" 
                          checked={item.paid || false}
                          onChange={() => togglePaid(item.id, !!item.paid)}
                          className="h-5 w-5 rounded border-gray-400 text-green-600 focus:ring-pink-500 cursor-pointer"
                          title="Mark as paid"
                        />

                        {/* Up/Down controls */}
                        <div className="flex items-center gap-2 select-none">
                          <div className="flex flex-col gap-1">
                            <button 
                              onClick={() => moveUp(index)} 
                              disabled={index === 0}
                              className="text-gray-300 hover:text-pink-600 p-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move Up"
                            >
                              ▲
                            </button>
                            <button 
                              onClick={() => moveDown(index)} 
                              disabled={index === items.length - 1}
                              className="text-gray-300 hover:text-pink-600 p-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move Down"
                            >
                              ▼
                            </button>
                          </div>
                        </div>

                        <div>
                          <span className={`font-semibold block ${item.paid ? 'text-green-900' : 'text-white'}`}>
                            {item.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 md:ml-4">
                        <button 
                          onClick={() => { 
                            setEditingBudgetId(item.id); 
                            setNewItemLabel(item.label); 
                            setNewItemAmount(item.actual);
                            scrollToForm();
                          }}
                          className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-400 font-medium hover:bg-gray-300 transition"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => deleteItem(item.id)}
                          className="text-white/80 hover:text-orange-600 transition p-2 rounded-full hover:bg-white/30"
                          title="Remove Category"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-orange-400/30">
                      <div className="flex items-center gap-2 flex-1 sm:flex-none justify-between sm:justify-start">
                        <label className="text-xs font-bold text-gray-700 uppercase mr-1 sm:mr-0">Amount</label>
                        <div className="flex items-center border border-gray-400 rounded-md p-1.5 bg-white/70 w-32">
                          <span className="text-gray-500 mr-1">$</span>
                          <span className="font-medium text-sm text-gray-900">{item.actual}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === "transactions" && (
          <TransactionsTab />
        )}

        {/* Summary totals section */}
        <div className="mt-8 space-y-4">
          <div className="bg-orange-500 p-5 rounded-lg border border-orange-400">
            <p className="text-xs font-bold text-orange-200 uppercase">Budget Remaining</p>
            <p className="text-3xl font-black text-white mt-1">
              ${totalIncome - totalActual}
            </p>
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
      </div>
    </div>
  );
}