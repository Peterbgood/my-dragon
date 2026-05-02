import { useState, useEffect } from "react";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
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
  
  const [newTransLabel, setNewTransLabel] = useState("");
  const [newTransCategory, setNewTransCategory] = useState("Groceries");
  const [newTransAmount, setNewTransAmount] = useState<number | "">("");

  // Read: Listen for real-time updates from Transactions Firestore
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

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTransLabel.trim() || !newTransAmount) return;

    await addDoc(collection(db, "transactions"), {
      label: newTransLabel,
      category: newTransCategory,
      amount: Number(newTransAmount),
      date: new Date().toLocaleDateString(),
    });
    setNewTransLabel("");
    setNewTransAmount("");
  };

  const deleteTransaction = async (id: string) => {
    await deleteDoc(doc(db, "transactions", id));
  };

  return (
    <div>
      {/* Add Transaction Form */}
      <form onSubmit={addTransaction} className="mb-8 flex gap-3 flex-col sm:flex-row">
        <input 
          type="text" 
          placeholder="Transaction description"
          className="flex-1 p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-900"
          value={newTransLabel}
          onChange={(e) => setNewTransLabel(e.target.value)}
        />
        <select
          value={newTransCategory}
          onChange={(e) => setNewTransCategory(e.target.value)}
          className="p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800 font-medium"
        >
          <option value="Groceries">Groceries</option>
          <option value="Take out">Take out</option>
          <option value="Gas">Gas</option>
          <option value="Utilities">Utilities</option>
          <option value="Other">Other</option>
        </select>
        <input 
          type="number" 
          placeholder="Amount ($)"
          className="p-3 border border-pink-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white w-full sm:w-36 text-gray-900"
          value={newTransAmount}
          onChange={(e) => setNewTransAmount(Number(e.target.value))}
        />
        <button className="bg-orange-500 text-white px-5 py-3 rounded-lg font-bold hover:bg-orange-600 transition shadow-sm w-full sm:w-auto">
          + ADD
        </button>
      </form>

      {/* Transactions List */}
      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="p-12 text-center text-white bg-white/10 rounded-lg border border-pink-400">
            <p className="font-medium text-white mb-1">No transactions added yet</p>
            <span className="text-sm text-pink-200">Use the form above to add a transaction.</span>
          </div>
        ) : (
          transactions.map((t) => (
            <div 
              key={t.id} 
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-orange-400 bg-orange-500 rounded-lg shadow-sm gap-4"
            >
              <div>
                <span className="font-bold text-white block">{t.label}</span>
                <span className="text-xs uppercase bg-orange-400 text-orange-900 px-2 py-0.5 rounded-full inline-block mt-1">
                  {t.category}
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-orange-400/50">
                <span className="text-sm text-pink-200">{t.date}</span>
                <span className="font-black text-white text-lg">${t.amount}</span>
                <button 
                  onClick={() => deleteTransaction(t.id)}
                  className="text-white/80 hover:text-orange-600 transition p-2 rounded-full hover:bg-white/30"
                  title="Remove Transaction"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}