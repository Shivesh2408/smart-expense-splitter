import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Users, Plus, LogOut, ArrowRight, Wallet, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateBalances } from '../utils/settlementAlgorithm';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', currentUser.email)
    );

    const unsubscribeGroups = onSnapshot(q, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      groupsData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setGroups(groupsData);
      
      // Now fetch expenses for these groups to calculate personal summary
      if (groupsData.length > 0) {
        // Since we can't easily query all groups if >10, we'll listen to all expenses
        // In a production app with huge data, this would be optimized or done via Cloud Functions
        const expensesQ = query(collection(db, 'expenses'));
        getDocs(expensesQ).then((expSnap) => {
          const groupIds = groupsData.map(g => g.id);
          const exps = expSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(e => groupIds.includes(e.groupId));
          setAllExpenses(exps);
          setLoading(false);
        }).catch(err => {
          console.error("Error fetching expenses", err);
          setLoading(false);
        });
      } else {
        setAllExpenses([]);
        setLoading(false);
      }
    }, (error) => {
      console.error("Error fetching groups:", error);
      setLoading(false);
    });

    return () => unsubscribeGroups();
  }, [currentUser]);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    
    setCreating(true);
    try {
      const newGroup = {
        name: newGroupName,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        members: [currentUser.email],
        memberDetails: [{
          email: currentUser.email,
          name: currentUser.displayName || 'Me'
        }]
      };

      const docRef = await addDoc(collection(db, 'groups'), newGroup);
      
      // Log activity
      await addDoc(collection(db, 'activities'), {
        groupId: docRef.id,
        type: 'group_created',
        message: `${currentUser.displayName || 'Someone'} created the group`,
        createdAt: serverTimestamp()
      });

      setNewGroupName('');
      setIsModalOpen(false);
      toast.success('Group created successfully!');
    } catch (error) {
      console.error("Error creating group:", error);
      toast.error('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  // Calculate Personal Summary
  let totalOwed = 0; // I owe
  let totalReceive = 0; // I get
  
  groups.forEach(group => {
    const groupExpenses = allExpenses.filter(e => e.groupId === group.id);
    const balances = calculateBalances(groupExpenses, group.memberDetails);
    
    const myBalance = balances[currentUser.email]?.amount || 0;
    if (myBalance < -0.01) {
      totalOwed += Math.abs(myBalance);
    } else if (myBalance > 0.01) {
      totalReceive += myBalance;
    }
  });

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">
            Dashboard
          </h1>
          <p className="text-slate-400 mt-1">Welcome back, {currentUser?.displayName || 'User'}</p>
        </div>
        <button 
          onClick={() => {
            logout();
            toast.success('Logged out successfully');
          }}
          className="flex items-center justify-center w-full sm:w-auto gap-2 text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-slate-800 border border-slate-700 sm:border-transparent"
        >
          <LogOut className="w-5 h-5" />
          <span className="inline">Sign Out</span>
        </button>
      </header>

      {/* Personal Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm font-medium">You get back</p>
              <h2 className="text-2xl font-bold text-white">₹{totalReceive.toFixed(2)}</h2>
            </div>
          </div>
        </div>
        
        <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="text-slate-400 text-sm font-medium">You owe</p>
              <h2 className="text-2xl font-bold text-white">₹{totalOwed.toFixed(2)}</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-purple-400" /> My Groups
        </h2>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsModalOpen(true)}
            className="h-40 rounded-2xl border-2 border-dashed border-slate-700 hover:border-purple-500 bg-slate-800/20 hover:bg-slate-800/50 flex flex-col items-center justify-center gap-3 transition-colors group"
          >
            <div className="w-12 h-12 rounded-full bg-slate-800 group-hover:bg-purple-500/20 flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6 text-slate-400 group-hover:text-purple-400 transition-colors" />
            </div>
            <span className="text-slate-300 font-medium">Create New Group</span>
          </motion.button>

          {groups.map((group) => (
            <Link to={`/group/${group.id}`} key={group.id}>
              <motion.div
                whileHover={{ scale: 1.02, y: -4 }}
                className="h-40 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-800/80 border border-slate-700 p-6 flex flex-col justify-between hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 transition-all cursor-pointer relative overflow-hidden group/card"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">{group.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Users className="w-4 h-4" />
                    <span>{group.memberDetails?.length || group.members?.length || 0} Members</span>
                  </div>
                </div>
                
                <div className="flex items-center text-purple-400 text-sm font-medium gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                  View Details <ArrowRight className="w-4 h-4" />
                </div>
              </motion.div>
            </Link>
          ))}
          
          {groups.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 border border-slate-700/50 border-dashed rounded-2xl bg-slate-800/20">
              <p>You aren't in any groups yet. Create one to get started!</p>
            </div>
          )}
        </div>
      )}

      {/* Create Group Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-800 border border-slate-700 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-white mb-6">Create Group</h2>
              <form onSubmit={handleCreateGroup}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Group Name</label>
                  <input
                    type="text"
                    autoFocus
                    required
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="e.g. Goa Trip, Apartment Rent"
                  />
                </div>
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl font-medium text-slate-300 hover:bg-slate-700 transition-colors border border-slate-700 sm:border-transparent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 shadow-lg shadow-purple-500/20 disabled:opacity-50"
                  >
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {creating ? 'Creating...' : 'Create Group'}
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
