import { useState, useEffect } from "react";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { db } from "./firebase";

interface TransactionItem {
  id: string;
  label: string;
  category: string;
  amount: number;
  date: string;
}

export default function TransactionsTab() {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  
  // New entry/edit states
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("Groceries");
  const [newAmount, setNewAmount] = useState<number | "">("");
  const [newDate, setNewDate] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  // 1. Read Transactions
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

  // 2. Add or Edit Transaction
  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newAmount) return;

    if (editingTransactionId) {
      // Save changes to original field
      const docRef = doc(db, "transactions", editingTransactionId);
      await updateDoc(docRef, {
        label: newLabel,
        category: newCategory,
        amount: Number(newAmount) || 0,
        date: newDate || new Date().toISOString().split("T")[0],
      });
      setEditingTransactionId(null);
    } else {
      // Add new
      await addDoc(collection(db, "transactions"), {
        label: newLabel,
        category: newCategory,
        amount: Number(newAmount) || 0,
        date: newDate || new Date().toISOString().split("T")[0],
      });
    }

    setNewLabel("");
    setNewCategory("Groceries");
    setNewAmount("");
    setNewDate("");
  };

  // 3. Delete Transaction
  const deleteItem = async (id: string) => {
    await deleteDoc(doc(db, "transactions", id));
  };

  const scrollToForm = () => {
    const el = document.getElementById("transaction-form");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Add/Edit Transaction Form */}
      <form id="transaction-form" onSubmit={addTransaction} className="flex gap-3 flex-col sm:flex-row sm:items-center">
        <input 
          type="text" 
          placeholder="Transaction description"
          className="w-full sm:flex-1 p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <select 
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          className="w-full sm:w-36 p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800"
        >
          <option value="Groceries">Groceries</option>
          <option value="Utilities">Utilities</option>
          <option value="Entertainment">Entertainment</option>
          <option value="Other">Other</option>
        </select>
        <input 
          type="number" 
          placeholder="Amount ($)"
          className="w-full sm:w-32 p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800"
          value={newAmount}
          onChange={(e) => setNewAmount(Number(e.target.value))}
        />
        <input 
          type="date"
          className="w-full sm:w-40 p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        <button className="w-full sm:w-auto bg-orange-500 text-white px-5 py-3 rounded-lg font-bold hover:bg-orange-600 transition shadow-sm">
          {editingTransactionId ? "SAVE" : "+ ADD"}
        </button>
        {editingTransactionId && (
          <button 
            type="button"
            onClick={() => {
              setEditingTransactionId(null);
              setNewLabel("");
              setNewCategory("Groceries");
              setNewAmount("");
              setNewDate("");
            }}
            className="w-full sm:w-auto bg-gray-500 text-white px-5 py-3 rounded-lg font-bold hover:bg-gray-600 transition shadow-sm"
          >
            Cancel
          </button>
        )}
      </form>

      {/* Transaction List */}
      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="p-12 text-center text-white bg-white/10 rounded-lg border border-pink-400">
            <p className="font-medium text-white mb-1">No transactions yet</p>
          </div>
        ) : (
          transactions.map((t) => (
            <div 
              key={t.id} 
              className="flex flex-col md:flex-row md:items-center justify-between p-4 border border-orange-400 bg-orange-500 rounded-lg shadow-sm gap-4 transition-colors"
            >
              <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
                <div>
                  <span className="font-semibold block text-white">
                    {t.label}
                  </span>
                </div>
                
                <div className="ml-2">
                  <span className="text-xs bg-orange-600/50 text-orange-100 px-2 py-1 rounded">
                    {t.category}
                  </span>
                </div>

                <div className="flex items-center gap-1 md:ml-4">
                  <button 
                    onClick={() => {
                      setEditingTransactionId(t.id);
                      setNewLabel(t.label);
                      setNewCategory(t.category);
                      setNewAmount(t.amount);
                      setNewDate(t.date);
                      scrollToForm();
                    }}
                    className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-400 font-medium hover:bg-gray-300 transition"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => deleteItem(t.id)}
                    className="text-white/80 hover:text-orange-600 transition p-2 rounded-full hover:bg-white/30"
                    title="Remove Transaction"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-orange-400/30">
                <div className="flex items-center gap-2 flex-1 sm:flex-none justify-between sm:justify-start">
                  <span className="text-xs font-bold text-gray-700 uppercase mr-1">Amount</span>
                  <div className="flex items-center border border-gray-400 rounded-md p-1.5 bg-white/70 w-32">
                    <span className="text-gray-500 mr-1">$</span>
                    <span className="font-medium text-sm text-gray-900">{t.amount}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-1 sm:flex-none justify-between sm:justify-start">
                  <span className="text-xs font-bold text-gray-700 uppercase mr-1">Date</span>
                  <span className="text-sm font-medium text-white">{t.date}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}