import { useState, useEffect, useCallback, useMemo, FormEvent } from "react";
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
  const [newAmount, setNewAmount] = useState<number | "">("");
  const [newDate, setNewDate] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const addTransaction = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newAmount) return;

    if (editingTransactionId) {
      const docRef = doc(db, "transactions", editingTransactionId);
      await updateDoc(docRef, {
        label: newLabel,
        amount: Number(newAmount) || 0,
        date: newDate || new Date().toISOString().split("T")[0],
      });
      setEditingTransactionId(null);
    } else {
      await addDoc(collection(db, "transactions"), {
        label: newLabel,
        amount: Number(newAmount) || 0,
        date: newDate || new Date().toISOString().split("T")[0],
      });
    }

    setNewLabel("");
    setNewAmount("");
    setNewDate("");
  }, [newLabel, newAmount, newDate, editingTransactionId]);

  const deleteItem = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "transactions", id));
  }, []);

  const scrollToForm = useCallback(() => {
    const el = document.getElementById("transaction-form");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const totalTransactions = useMemo(() => transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0), [transactions]);
  const totalActual = useMemo(() => items.reduce((sum, item) => sum + (Number(item.actual) || 0), 0), [items]);
  const finalRemaining = useMemo(() => totalIncome - totalActual - totalTransactions, [totalIncome, totalActual, totalTransactions]);
  const selectedTotal = useMemo(() => {
    return transactions
      .filter((t) => selectedIds.has(t.id))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions, selectedIds]);

  const displayedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (!isNaN(timeA) && !isNaN(timeB)) {
        return timeB - timeA;
      }
      return b.id.localeCompare(a.id);
    });
  }, [transactions]);

  return (
    <div className="space-y-6 relative">
      {/* Floating Tally Dashboard */}
      {selectedIds.size > 0 && (
        <div className="fixed top-4 right-4 z-50 bg-lime-800 border border-lime-600 rounded-2xl p-4 shadow-xl flex items-center gap-4 text-white">
          <div>
            <p className="text-[10px] font-black tracking-wider text-lime-200 uppercase">Selected Tally</p>
            <p className="text-2xl font-black mt-0.5">
              ${selectedTotal}
            </p>
          </div>
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="text-xs bg-white text-lime-800 px-2.5 py-1.5 font-black rounded-lg uppercase tracking-wider hover:bg-gray-100 transition shadow-sm"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-orange-500 border border-orange-400 rounded-2xl p-6 shadow-md flex justify-between items-center px-8">
        <div>
          <p className="text-xs font-black tracking-wider text-orange-200 uppercase">Total Transactions</p>
          <p className="text-3xl sm:text-4xl font-black text-white mt-1">
            ${totalTransactions}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-black tracking-wider text-orange-200 uppercase">Final Remaining</p>
          <p className={`text-3xl sm:text-4xl font-black mt-1 ${finalRemaining >= 0 ? 'text-lime-200' : 'text-orange-400'}`}>
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
        
        <div className="flex gap-3 w-full">
          <input 
            type="number" 
            placeholder="Amount ($)"
            className="flex-1 p-4 border border-pink-300 rounded-xl shadow-sm bg-white text-gray-800 text-lg"
            value={newAmount}
            onChange={(e) => setNewAmount(Number(e.target.value) || "")}
          />

          <div className="relative p-4 border border-pink-300 rounded-xl shadow-sm bg-white text-gray-800 text-lg flex items-center justify-center min-w-[4rem] text-center font-bold cursor-pointer">
            <span>{new Date(newDate ? newDate + 'T00:00:00' : Date.now()).getDate()}</span>
            <input 
              type="date"
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
        </div>
        
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
          displayedTransactions.map((t) => {
            const isSelected = selectedIds.has(t.id);
            return (
              <div 
                key={t.id} 
                onClick={() => toggleSelection(t.id)}
                className={`border rounded-xl p-3 shadow-sm flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                  isSelected 
                    ? "bg-lime-800 border-lime-600 text-lime-100" 
                    : "bg-orange-500 border-orange-400 text-white"
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <h3 className={`font-black truncate ${isSelected ? "text-lime-100" : "text-white"}`}>
                    {t.label}
                  </h3>
                  <p className={`text-[10px] font-bold uppercase ${isSelected ? "text-lime-300" : "text-orange-200"}`}>
                    {t.date}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <span className={`font-black text-lg ${isSelected ? "text-lime-200" : "text-white"}`}>
                    ${t.amount}
                  </span>
                  <button 
                    onClick={() => {
                      setEditingTransactionId(t.id);
                      setNewLabel(t.label);
                      setNewAmount(t.amount);
                      setNewDate(t.date);
                      scrollToForm();
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                      isSelected 
                        ? "bg-lime-900/40 text-lime-100 hover:bg-lime-900/60" 
                        : "bg-white/90 text-orange-600 hover:bg-white"
                    }`}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => deleteItem(t.id)}
                    className={`hover:text-white/50 ${isSelected ? "text-lime-300 hover:text-white" : "text-white/80 hover:text-white"}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}