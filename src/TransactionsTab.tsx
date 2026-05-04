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

interface BudgetItem {
  id: string;
  label: string;
  actual: number;
  order?: number;
  paid?: boolean;
}

export default function TransactionsTab({ items, totalIncome }: { items: BudgetItem[]; totalIncome: number }) {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("Groceries");
  const [newAmount, setNewAmount] = useState<number | "">("");
  const [newDate, setNewDate] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

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
    if (!newLabel.trim() || !newAmount) return;

    if (editingTransactionId) {
      const docRef = doc(db, "transactions", editingTransactionId);
      await updateDoc(docRef, {
        label: newLabel,
        category: newCategory,
        amount: Number(newAmount) || 0,
        date: newDate || new Date().toISOString().split("T")[0],
      });
      setEditingTransactionId(null);
    } else {
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

  const deleteItem = async (id: string) => {
    await deleteDoc(doc(db, "transactions", id));
  };

  const scrollToForm = () => {
    const el = document.getElementById("transaction-form");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const totalTransactions = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalActual = items.reduce((sum, item) => sum + (Number(item.actual) || 0), 0);
  const finalRemaining = totalIncome - totalActual - totalTransactions;

  // New transactions first
  const displayedTransactions = [...transactions].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
      return timeB - timeA;
    }
    return b.id.localeCompare(a.id);
  });

  return (
    <div className="space-y-6">
      {/* Summary totals section on the TOP */}
      <div className="bg-orange-500 border border-orange-400 rounded-2xl p-6 shadow-md flex justify-between items-center px-8">
        <div>
          <p className="text-xs font-black tracking-wider text-orange-200 uppercase">Total Transactions</p>
          <p className="text-3xl sm:text-4xl font-black text-white mt-1">
            ${totalTransactions}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-black tracking-wider text-orange-200 uppercase">Final Remaining</p>
          <p className={`text-3xl sm:text-4xl font-black mt-1 ${finalRemaining >= 0 ? 'text-green-300' : 'text-orange-400'}`}>
            ${finalRemaining}
          </p>
        </div>
      </div>

      <form 
        id="transaction-form" 
        onSubmit={addTransaction} 
        className="flex flex-col gap-3 w-full max-w-full overflow-hidden"
      >
        <input 
          type="text" 
          placeholder="Transaction description"
          className="w-full p-4 border border-pink-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white text-gray-800 text-lg"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        
        <div className="flex flex-col sm:flex-row gap-3">
            <select 
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full sm:w-1/2 p-4 border border-pink-300 rounded-xl shadow-sm bg-white text-gray-800 text-lg"
            >
              <option value="Groceries">Groceries</option>
              <option value="Utilities">Utilities</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Other">Other</option>
            </select>

            <input 
              type="number" 
              placeholder="Amount ($)"
              className="w-full sm:w-1/2 p-4 border border-pink-300 rounded-xl shadow-sm bg-white text-gray-800 text-lg"
              value={newAmount}
              onChange={(e) => setNewAmount(Number(e.target.value) || "")}
            />
        </div>

        <input 
          type="date"
          className="w-full p-4 border border-pink-300 rounded-xl shadow-sm bg-white text-gray-800 text-lg appearance-none min-w-0"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
        />
        
        <div className="flex gap-2 w-full">
          <button className="flex-1 bg-orange-500 text-white p-4 rounded-xl font-black text-xl hover:bg-orange-600 transition shadow-md uppercase tracking-wider">
            {editingTransactionId ? "SAVE" : "+ ADD"}
          </button>
          {editingTransactionId && (
            <button 
              type="button"
              onClick={() => {
                setEditingTransactionId(null);
                setNewLabel("");
                setNewAmount("");
                setNewDate("");
              }}
              className="flex-1 bg-gray-500 text-white p-4 rounded-xl font-black text-xl hover:bg-gray-600 transition shadow-md"
            >
              CANCEL
            </button>
          )}
        </div>
      </form>

      <div className="space-y-4">
        {displayedTransactions.length === 0 ? (
          <div className="p-12 text-center text-white bg-white/10 rounded-2xl border border-pink-400">
            <p className="font-bold opacity-80 uppercase tracking-widest">No transactions yet</p>
          </div>
        ) : (
          displayedTransactions.map((t) => (
            <div 
              key={t.id} 
              className="bg-orange-500 border border-orange-400 rounded-2xl p-4 shadow-md flex justify-between items-center"
            >
              {/* Left Side: Name and Date */}
              <div className="text-left">
                <h3 className="text-white font-black text-xl italic tracking-tight">{t.label}</h3>
                <p className="text-[10px] font-bold text-orange-200 uppercase mt-0.5">{t.date}</p>
              </div>

              {/* Right Side: Amount and Actions */}
              <div className="flex items-center gap-4">
                <span className="text-white font-black text-2xl">${t.amount}</span>
                <button 
                  onClick={() => {
                    setEditingTransactionId(t.id);
                    setNewLabel(t.label);
                    setNewCategory(t.category);
                    setNewAmount(t.amount);
                    setNewDate(t.date);
                    scrollToForm();
                  }}
                  className="bg-white/90 text-orange-600 px-3 py-1.5 rounded-lg text-xs font-black uppercase shadow-sm"
                >
                  Edit
                </button>
                <button 
                  onClick={() => deleteItem(t.id)}
                  className="bg-orange-700/50 text-white p-1.5 rounded-lg hover:bg-red-600 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}