import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../services/firebase';
import { getUserData } from '../services/authService';

interface UserData {
  userId: string;
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  provider: string;
  createdAt: unknown;
}

interface AuthContextValue {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userData: null,
  loading: true,
  refreshUserData: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUserData(uid: string) {
    const data = await getUserData(uid);
    setUserData(data as UserData | null);
  }

  async function refreshUserData() {
    if (user) await loadUserData(user.uid);
  }

  useEffect(() => {
    // Safety timeout: if Firebase auth doesn't respond in 8s, unblock the UI
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 8000);

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(timeout);
      setUser(firebaseUser);
      if (firebaseUser) {
        await loadUserData(firebaseUser.uid);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading, refreshUserData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
