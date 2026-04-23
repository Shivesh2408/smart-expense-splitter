import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile
} from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState(false);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(auth, user => {
        setCurrentUser(user);
        setLoading(false);
      });
      return unsubscribe;
    } catch (error) {
      console.error("Firebase auth error (Missing config?):", error);
      setFirebaseError(true);
      setLoading(false);
    }
  }, []);

  function signup(email, password, name) {
    return createUserWithEmailAndPassword(auth, email, password).then((userCredential) => {
      return updateProfile(userCredential.user, {
        displayName: name
      });
    });
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  const value = {
    currentUser,
    login,
    signup,
    logout,
    firebaseError
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
