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

// Define the shape of a budget item
interface BudgetItem {
  id: string;
  label: string;
  actual: number;
  order?: number;
}

export default function App() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemAmount, setNewItemAmount] = useState<number | "">("");
  const [totalIncome, setTotalIncome] = useState(6000); // Default to 6000, can be edited
  
  // App Lock State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  // Edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  // 1. Read: Listen for real-time updates from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "budget"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as BudgetItem[];
      
      // Sort items by their order property
      data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      setItems(data);
    });
    return () => unsubscribe();
  }, []);

  // 2. Auto Unlock Mechanism: Check PIN as soon as 4 digits are entered
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

  // 3. Create: Add a new custom field with label and amount
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemLabel.trim()) return;
    
    await addDoc(collection(db, "budget"), {
      label: newItemLabel,
      actual: Number(newItemAmount) || 0,
      order: items.length
    });
    setNewItemLabel("");
    setNewItemAmount("");
  };

  // 4. Update: Save changes to actual values
  const updateValue = async (id: string, value: string) => {
    const itemDoc = doc(db, "budget", id);
    await updateDoc(itemDoc, { actual: Number(value) });
  };

  // 5. Update: Edit label/category name
  const saveLabel = async (id: string) => {
    if (!editingLabel.trim()) return;
    const itemDoc = doc(db, "budget", id);
    await updateDoc(itemDoc, { label: editingLabel });
    setEditingId(null);
  };

  // 6. Delete: Remove a field
  const deleteItem = async (id: string) => {
    await deleteDoc(doc(db, "budget", id));
  };

  // 7. Reorder: Move Items Up and Down
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

  const totalActual = items.reduce((sum, item) => sum + item.actual, 0);

  // Render Lock Screen if not unlocked
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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

  // Render Main Application
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 font-sans">
      <header className="mb-8 border-b pb-6 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-pink-600 italic tracking-wider">MY DRAGON</h1>
          <p className="text-gray-500 text-sm mt-1">Monthly Budget Strategy</p>
        </div>
        <button 
          onClick={() => setIsUnlocked(false)}
          className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-200 font-semibold transition"
        >
          Lock App
        </button>
      </header>

      {/* Centered Income Component */}
      <div className="flex justify-center mt-6 mb-8">
        <div className="p-4 bg-pink-50 rounded-lg border border-pink-100 text-center w-full max-w-sm shadow-sm">
          <label className="block text-xs uppercase font-bold text-pink-600 mb-1">Total Income</label>
          <div className="flex items-center justify-center text-3xl font-extrabold text-gray-800">
            <span className="mr-1 text-pink-500">$</span>
            <input 
              type="number" 
              value={totalIncome}
              onChange={(e) => setTotalIncome(Number(e.target.value))}
              className="w-36 bg-transparent border-b-2 border-transparent focus:border-pink-500 focus:outline-none text-center font-extrabold"
            />
          </div>
        </div>
      </div>

      {/* Add New Field Form with Amount input */}
      <form onSubmit={addItem} className="mb-8 flex gap-3 flex-col sm:flex-row">
        <input 
          type="text" 
          placeholder="e.g., Mortgage, Gas, Groceries"
          className="flex-1 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
          value={newItemLabel}
          onChange={(e) => setNewItemLabel(e.target.value)}
        />
        <input 
          type="number" 
          placeholder="Amount ($)"
          className="p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-500 w-full sm:w-40"
          value={newItemAmount}
          onChange={(e) => setNewItemAmount(Number(e.target.value))}
        />
        <button className="bg-orange-500 text-white px-5 py-3 rounded-lg font-bold hover:bg-orange-600 transition shadow-sm w-full sm:w-auto">
          + ADD FIELD
        </button>
      </form>

      {/* List of Fields */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="p-12 text-center text-gray-400 bg-white rounded-lg border border-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-gray-600 mb-1">No budget fields yet</p>
            <span className="text-sm">Type a name above to create your first field.</span>
          </div>
        ) : (
          items.map((item, index) => (
            <div 
              key={item.id} 
              className="flex flex-col md:flex-row md:items-center justify-between p-4 border border-gray-200 bg-white rounded-lg shadow-sm gap-4 transition-colors"
            >
              {/* Category Name & Move/Pin Controls */}
              <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
                <div className="flex items-center gap-3">
                  {/* Up/Down controls */}
                  <div className="flex items-center gap-2 select-none">
                    <div className="flex flex-col gap-1">
                      <button 
                        onClick={() => moveUp(index)} 
                        disabled={index === 0}
                        className="text-gray-400 hover:text-pink-600 p-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button 
                        onClick={() => moveDown(index)} 
                        disabled={index === items.length - 1}
                        className="text-gray-400 hover:text-pink-600 p-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move Down"
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Label / Input area */}
                  <div>
                    {editingId === item.id ? (
                      <input 
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        className="border border-gray-300 rounded p-1.5 font-semibold text-gray-700 w-32 md:w-44 focus:outline-none focus:ring-2 focus:ring-pink-500" 
                      />
                    ) : (
                      <span className="font-semibold text-gray-700 block">{item.label}</span>
                    )}
                  </div>
                </div>

                {/* Edit Controls */}
                <div className="flex items-center gap-1 md:ml-4">
                  {editingId === item.id ? (
                    <button 
                      onClick={() => saveLabel(item.id)}
                      className="text-xs bg-green-600 text-white px-2 py-1 rounded font-semibold hover:bg-green-700 transition"
                    >
                      Save
                    </button>
                  ) : (
                    <button 
                      onClick={() => { setEditingId(item.id); setEditingLabel(item.label); }}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-300 font-medium hover:bg-gray-200 transition"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Amount field with responsive spacing */}
              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-gray-100">
                <div className="flex items-center gap-2 flex-1 sm:flex-none justify-between sm:justify-start">
                  <label className="text-xs font-bold text-gray-400 uppercase mr-1 sm:mr-0">Amount</label>
                  <div className="flex items-center border border-gray-300 rounded-md p-1.5 bg-green-50/40 w-32">
                    <span className="text-gray-400 mr-1">$</span>
                    <input 
                      type="number" 
                      className="w-full focus:outline-none font-medium text-sm bg-transparent"
                      value={item.actual || ""}
                      placeholder="0"
                      onChange={(e) => updateValue(item.id, e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  onClick={() => deleteItem(item.id)}
                  className="text-gray-400 hover:text-orange-500 transition p-2 rounded-full hover:bg-orange-50"
                  title="Remove Category"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary totals section */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-5 rounded-lg border border-gray-200">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase">Total Expenses</p>
          <p className="text-3xl font-black text-pink-600 mt-1">
            ${totalActual}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase">Total Income</p>
          <p className="text-3xl font-black text-gray-800 mt-1">
            ${totalIncome}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase">Difference</p>
          <p className={`text-3xl font-black mt-1 ${totalIncome - totalActual >= 0 ? 'text-green-600' : 'text-orange-500'}`}>
            ${totalIncome - totalActual}
          </p>
        </div>
      </div>
    </div>
  );
}