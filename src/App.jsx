import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import GroupDetail from './components/GroupDetail';
import Brainots from './components/Brainots';
import { AlertCircle, Download } from 'lucide-react';

const PrivateRoute = ({ children }) => {
  const { currentUser, firebaseError } = useAuth();
  
  if (firebaseError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-50 p-4">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full border border-red-500/30 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">Firebase Config Missing</h2>
          <p className="text-slate-300 mb-6">
            Please add your Firebase configuration to <code className="bg-slate-700 px-2 py-1 rounded">src/firebase.js</code> to run this application.
          </p>
        </div>
      </div>
    );
  }

  return currentUser ? children : <Navigate to="/login" />;
};

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-slate-800 border border-slate-700 shadow-2xl rounded-2xl p-4 z-50 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5">
      <div className="flex flex-col">
        <span className="font-bold text-white text-sm">Install App</span>
        <span className="text-xs text-slate-400">Add to home screen for a better experience</span>
      </div>
      <button 
        onClick={handleInstallClick}
        className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl p-2 px-4 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
      >
        <Download className="w-4 h-4" /> Install
      </button>
      <button onClick={() => setShowPrompt(false)} className="absolute -top-2 -right-2 w-6 h-6 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full flex items-center justify-center text-xs">
        ✕
      </button>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Brainots />
        <InstallPrompt />
        <Toaster position="top-right" toastOptions={{ className: 'bg-slate-800 text-white border border-slate-700' }} />
        <div className="min-h-screen font-sans">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } />
            <Route path="/group/:groupId" element={
              <PrivateRoute>
                <GroupDetail />
              </PrivateRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
