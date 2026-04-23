import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, updateDoc, arrayUnion, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { calculateBalances, calculateSmartSettlements } from '../utils/settlementAlgorithm';
import { spawnBrainots } from './Brainots';
import { ArrowLeft, UserPlus, PlusCircle, Receipt, ArrowRight, BrainCircuit, Activity, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

export default function GroupDetail() {
  const { groupId } = useParams();
  const { currentUser } = useAuth();
  
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  
  // Form states
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [splitType, setSplitType] = useState('EQUAL'); // EQUAL, PERCENTAGE, CUSTOM
  
  // Array of emails selected for split
  const [expenseSplitBetween, setExpenseSplitBetween] = useState([]);
  // Custom split amounts/percentages mapping: { email: value }
  const [splitValues, setSplitValues] = useState({});

  useEffect(() => {
    fetchGroupDetails();
    
    // Real-time listener for expenses
    const expQ = query(collection(db, 'expenses'), where('groupId', '==', groupId));
    const unsubExp = onSnapshot(expQ, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      expensesData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setExpenses(expensesData);
    });

    // Real-time listener for activities
    const actQ = query(collection(db, 'activities'), where('groupId', '==', groupId));
    const unsubAct = onSnapshot(actQ, (snapshot) => {
      const activitiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      activitiesData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setActivities(activitiesData);
    });

    return () => { unsubExp(); unsubAct(); };
  }, [groupId]);

  const fetchGroupDetails = async () => {
    try {
      const docRef = doc(db, 'groups', groupId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGroup({ id: docSnap.id, ...data });
        if (!expensePaidBy) setExpensePaidBy(currentUser.email);
      }
    } catch (error) {
      console.error("Error fetching group details:", error);
      toast.error('Failed to load group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberEmail || !newMemberName) return;
    setAddingMember(true);

    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        members: arrayUnion(newMemberEmail),
        memberDetails: arrayUnion({ email: newMemberEmail, name: newMemberName })
      });
      
      await addDoc(collection(db, 'activities'), {
        groupId,
        type: 'member_added',
        message: `${currentUser.displayName || 'Someone'} added ${newMemberName} to the group`,
        createdAt: serverTimestamp()
      });

      setNewMemberEmail('');
      setNewMemberName('');
      setShowAddMember(false);
      toast.success('Member added!');
      fetchGroupDetails(); // Refresh details
    } catch (error) {
      console.error("Error adding member:", error);
      toast.error('Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const calculateFinalSplits = () => {
    const totalAmount = parseFloat(expenseAmount) || 0;
    let splitsObj = {};

    if (splitType === 'EQUAL') {
      const share = totalAmount / expenseSplitBetween.length;
      expenseSplitBetween.forEach(email => {
        splitsObj[email] = share;
      });
    } else if (splitType === 'PERCENTAGE') {
      expenseSplitBetween.forEach(email => {
        const pct = parseFloat(splitValues[email]) || 0;
        splitsObj[email] = (totalAmount * pct) / 100;
      });
    } else if (splitType === 'CUSTOM') {
      expenseSplitBetween.forEach(email => {
        splitsObj[email] = parseFloat(splitValues[email]) || 0;
      });
    }
    return splitsObj;
  };

  const validateSplit = (splitsObj) => {
    const totalAmount = parseFloat(expenseAmount) || 0;
    const sum = Object.values(splitsObj).reduce((acc, val) => acc + val, 0);
    // Use an epsilon for floating point comparison
    return Math.abs(totalAmount - sum) < 0.05;
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!expenseDesc || !expenseAmount || !expensePaidBy || expenseSplitBetween.length === 0) return;

    const splitsObj = calculateFinalSplits();
    
    if (splitType !== 'EQUAL' && !validateSplit(splitsObj)) {
      toast.error(splitType === 'PERCENTAGE' ? 'Percentages must add up to 100%' : 'Custom amounts must equal total amount');
      return;
    }

    setAddingExpense(true);
    try {
      const newExpense = {
        groupId,
        description: expenseDesc,
        amount: parseFloat(expenseAmount),
        paidBy: expensePaidBy,
        splits: splitsObj,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      };

      await addDoc(collection(db, 'expenses'), newExpense);
      
      const payerName = group.memberDetails.find(m => m.email === expensePaidBy)?.name || expensePaidBy;
      await addDoc(collection(db, 'activities'), {
        groupId,
        type: 'expense_added',
        message: `${payerName} added "₹${expenseAmount} for ${expenseDesc}"`,
        createdAt: serverTimestamp()
      });

      spawnBrainots(12, "Optimizing splits...");
      toast.success('Expense added!');
      
      setExpenseDesc('');
      setExpenseAmount('');
      setSplitValues({});
      setShowAddExpense(false);
      
    } catch (error) {
      console.error("Error adding expense:", error);
      toast.error('Failed to add expense');
    } finally {
      setAddingExpense(false);
    }
  };

  const toggleSplitMember = (email) => {
    setExpenseSplitBetween(prev => 
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Loading group...</p>
        </div>
      </div>
    );
  }

  if (!group) return <div className="text-center p-8 text-slate-400">Group not found</div>;

  const balances = calculateBalances(expenses, group.memberDetails);
  const settlements = calculateSmartSettlements(balances);

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 font-medium">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">{group.name}</h1>
          <p className="text-slate-400">{group.memberDetails.length} Members</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => setShowAddMember(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium flex items-center gap-2 transition-colors border border-slate-700 hover:border-slate-600"
          >
            <UserPlus className="w-4 h-4" /> Add Member
          </button>
          <button 
            onClick={() => {
              setShowAddExpense(true);
              setExpenseSplitBetween(group.memberDetails.map(m => m.email));
              setSplitType('EQUAL');
              setSplitValues({});
            }}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="w-4 h-4" /> Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Expenses & Activity */}
        <div className="lg:col-span-8 space-y-8">
          
          <section>
            <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2 mb-6">
              <Receipt className="w-6 h-6 text-purple-400" /> Recent Expenses
            </h2>
            
            {expenses.length === 0 ? (
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-12 text-center border-dashed">
                <Receipt className="w-12 h-12 text-slate-500 mx-auto mb-3 opacity-50" />
                <p className="text-slate-400 font-medium">No expenses yet. Add one to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence>
                  {expenses.map(expense => (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={expense.id} 
                      className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-5 flex flex-col sm:flex-row justify-between gap-4 hover:border-slate-600 transition-colors"
                    >
                      <div>
                        <h3 className="text-lg font-semibold text-white">{expense.description}</h3>
                        <p className="text-sm text-slate-400 mt-1">
                          Paid by <span className="text-purple-300 font-medium">{group.memberDetails.find(m => m.email === expense.paidBy)?.name || expense.paidBy}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">₹{expense.amount.toFixed(2)}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Split between {Object.keys(expense.splits || {}).length || expense.splitBetween?.length || 0}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-2 mb-6">
              <Activity className="w-6 h-6 text-green-400" /> Activity Timeline
            </h2>
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              {activities.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No activity recorded yet.</p>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
                  {activities.map((activity, idx) => (
                    <div key={activity.id || idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-700 bg-slate-800 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        {activity.type === 'expense_added' ? <Receipt className="w-4 h-4 text-purple-400" /> : <UserPlus className="w-4 h-4 text-blue-400" />}
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 shadow-sm">
                        <div className="flex flex-col gap-1">
                          <p className="text-sm text-slate-300">{activity.message}</p>
                          <time className="text-xs text-slate-500 font-medium">
                            {activity.createdAt ? formatDistanceToNow(activity.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                          </time>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Smart Settlements */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-6 relative overflow-hidden shadow-xl sticky top-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
            
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <BrainCircuit className="w-6 h-6 text-blue-400" /> Smart Settlements
            </h2>

            {settlements.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🎉</span>
                </div>
                <p className="text-slate-300 font-medium">All settled up!</p>
                <p className="text-slate-500 text-sm mt-1">No pending transactions.</p>
              </div>
            ) : (
              <div className="space-y-4 relative z-10">
                {settlements.map((tx, idx) => (
                  <div key={idx} className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-300 uppercase shrink-0">
                        {tx.from.name.charAt(0)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-slate-300 truncate max-w-[80px]" title={tx.from.name}>{tx.from.name}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">pays</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center px-2">
                      <div className="font-bold text-green-400">₹{tx.amount.toFixed(2)}</div>
                      <ArrowRight className="w-4 h-4 text-purple-500/50" />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end min-w-0">
                        <span className="text-sm text-slate-300 truncate max-w-[80px]" title={tx.to.name}>{tx.to.name}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">gets</span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-300 uppercase shrink-0">
                        {tx.to.name.charAt(0)}
                      </div>
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => spawnBrainots(15, "Smart settlement ready!")}
                  className="w-full mt-4 py-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300 font-medium hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2 transform active:scale-95"
                >
                  <BrainCircuit className="w-5 h-5" /> Simulate Optimization
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddMember && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6">Add Member</h2>
              <form onSubmit={handleAddMember}>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
                    <input type="text" required value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Alice" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                    <input type="email" required value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="alice@example.com" />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setShowAddMember(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-300 hover:bg-slate-700 transition-colors">Cancel</button>
                  <button type="submit" disabled={addingMember} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 shadow-lg disabled:opacity-50">
                    {addingMember && <Loader2 className="w-4 h-4 animate-spin" />} Add Member
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showAddExpense && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl m-auto my-8">
              <h2 className="text-2xl font-bold text-white mb-6">Add Expense</h2>
              <form onSubmit={handleAddExpense}>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                    <input type="text" required value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Dinner, Taxi, etc." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Amount (₹)</label>
                      <input type="number" step="0.01" min="0.01" required value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Paid By</label>
                      <select value={expensePaidBy} onChange={(e) => setExpensePaidBy(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none">
                        {group.memberDetails.map(m => (
                          <option key={m.email} value={m.email}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex justify-between">
                      Split Type
                    </label>
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700 mb-3">
                      {['EQUAL', 'PERCENTAGE', 'CUSTOM'].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => { setSplitType(type); setSplitValues({}); }}
                          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${splitType === type ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    <label className="block text-sm font-medium text-slate-300 mb-2">Split Between</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {group.memberDetails.map(m => {
                        const isSelected = expenseSplitBetween.includes(m.email);
                        return (
                          <div key={m.email} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isSelected ? 'border-purple-500/50 bg-slate-800' : 'border-slate-700 bg-slate-900/50'}`}>
                            <label className="flex items-center gap-3 cursor-pointer flex-1">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => toggleSplitMember(m.email)}
                                className="w-5 h-5 rounded border-slate-600 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900 bg-slate-900"
                              />
                              <span className="text-slate-200">{m.name}</span>
                            </label>
                            
                            {isSelected && splitType !== 'EQUAL' && (
                              <input 
                                type="number" 
                                step="0.01" 
                                min="0" 
                                placeholder={splitType === 'PERCENTAGE' ? '%' : '₹'}
                                value={splitValues[m.email] || ''}
                                onChange={(e) => setSplitValues({...splitValues, [m.email]: e.target.value})}
                                className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-500"
                                required
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {splitType !== 'EQUAL' && expenseAmount && (
                      <div className="text-right mt-2 text-xs text-slate-400">
                        Total {splitType === 'PERCENTAGE' ? '%' : '₹'}: {Object.values(splitValues).reduce((a, b) => a + (parseFloat(b) || 0), 0).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                  <button type="button" onClick={() => setShowAddExpense(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-300 hover:bg-slate-700 transition-colors">Cancel</button>
                  <button type="submit" disabled={addingExpense || expenseSplitBetween.length === 0} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 shadow-lg disabled:opacity-50">
                    {addingExpense && <Loader2 className="w-4 h-4 animate-spin" />} Save Expense
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
