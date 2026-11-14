import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType, testFirestoreConnection } from '../lib/firebase.ts';
import { checkBackendHealth, getWebSocketUrl } from '../lib/api.ts';
import { extractFirebaseAuthCode, mapFirebaseAuthError } from '../lib/authErrors.ts';
import { DEFAULT_PRICING_PACKAGES, SEED_COMPANIES, SEED_JOBS } from '../lib/rwandaData.ts';
import type { AppTab, LanguageCode, NotificationItem, UserAccount, UserRole } from '../types.ts';

interface RealtimeEventMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface AppContextValue {
  user: User | null;
  authReady: boolean;
  userAccount: UserAccount | null;
  isAdmin: boolean;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  notifications: NotificationItem[];
  liveBanner: RealtimeEventMessage | null;
  dismissLiveBanner: () => void;
  wsConnected: boolean;
  signingIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  switchRole: (role: 'candidate' | 'employer') => Promise<void>;
  authError: string | null;
  authErrorCode: string | null;
  clearAuthError: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [language, setLanguageState] = useState<LanguageCode>('rw');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeTab, setActiveTab] = useState<AppTab>('jobs');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [liveBanner, setLiveBanner] = useState<RealtimeEventMessage | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // WebSocket client for real-time vacancy, application, and payment notifications
  useEffect(() => {
    const wsUrl = getWebSocketUrl();
    if (!wsUrl) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;
    let everOpened = false;
    let reconnectAttempts = 0;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }
      ws.onopen = () => {
        everOpened = true;
        reconnectAttempts = 0;
        if (!disposed) setWsConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeEventMessage;
          if (parsed.type === 'connection:ready') {
            setWsConnected(true);
          } else {
            setLiveBanner(parsed);
          }
        } catch {
          // Ignore malformed frame
        }
      };
      ws.onclose = () => {
        if (!disposed) {
          setWsConnected(false);
          // Only retry if this host actually established a WebSocket previously (avoid console spam)
          if (everOpened && reconnectAttempts < 2) {
            reconnectAttempts += 1;
            reconnectTimer = window.setTimeout(connect, 5000);
          }
        }
      };
    };

    checkBackendHealth()
      .then((health) => {
        if (!disposed && health.ok && health.wsEnabled) {
          connect();
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          const pending = ws;
          pending.onopen = () => pending.close();
        }
      }
    };
  }, []);

  // Firebase Auth listener + user profile bootstrap + admin initial seeding
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserAccount(null);
        setNotifications([]);
        setAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        const now = new Date().toISOString();
        let currentAccount: UserAccount;

        if (!snap.exists()) {
          currentAccount = {
            uid: firebaseUser.uid,
            displayName: (
              (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Umukoresha').trim() ||
              'Umukoresha'
            ).slice(0, 120),
            role: 'candidate',
            language: 'rw',
            status: 'active',
            createdAt: now,
            updatedAt: now,
          };
          if (firebaseUser.emailVerified) {
            await setDoc(userRef, currentAccount);
            await setDoc(doc(db, 'users', firebaseUser.uid, 'private', 'info'), {
              uid: firebaseUser.uid,
              email: (firebaseUser.email || '').slice(0, 254),
              phone: '',
              district: 'Gasabo',
              consentAccepted: true,
              consentUpdatedAt: now,
            });
          } else {
            setAuthError(
              'Emeza imeyili ya konti yawe mbere yo kubika amakuru muri Firestore.'
            );
          }
          setUserAccount(currentAccount);
        } else {
          currentAccount = snap.data() as UserAccount;
          setUserAccount(currentAccount);
          if (currentAccount.language) {
            setLanguageState(currentAccount.language);
          }
        }

        // If signed-in user is bootstrapped admin, ensure initial Rwanda pricing, companies, and jobs exist in Firestore
        const isBootstrappedAdmin =
          firebaseUser.email === 'toxiccoderkiller@gmail.com' && firebaseUser.emailVerified;

        if (isBootstrappedAdmin) {
          try {
            const [pricingSnap, jobsSnap] = await Promise.all([
              getDocs(query(collection(db, 'pricing_config'), where('active', '==', true), limit(1))),
              getDocs(query(collection(db, 'jobs'), where('status', '==', 'published'), limit(1))),
            ]);

            if (pricingSnap.empty || jobsSnap.empty) {
              const batch = writeBatch(db);
              if (pricingSnap.empty) {
                for (const pkg of DEFAULT_PRICING_PACKAGES) {
                  batch.set(doc(db, 'pricing_config', pkg.id), pkg);
                }
              }
              if (jobsSnap.empty) {
                for (const comp of SEED_COMPANIES) {
                  batch.set(doc(db, 'companies', comp.id), comp);
                }
                for (const job of SEED_JOBS) {
                  batch.set(doc(db, 'jobs', job.id), job);
                }
              }
              await batch.commit();
            }
          } catch (seedErr) {
            console.warn('Initial Firestore seed check skipped or deferred:', seedErr);
          }
        }
      } catch (err) {
        console.error('Error loading user account:', err);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Real-time notifications listener (sorted client-side to avoid composite index dependency)
  useEffect(() => {
    if (!authReady || !user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => d.data() as NotificationItem)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setNotifications(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );
    return () => unsubscribe();
  }, [authReady, user]);

  const isAdmin = Boolean(
    user?.email === 'toxiccoderkiller@gmail.com' ||
      (userAccount &&
        ['admin', 'super_admin', 'finance_manager', 'recruitment_officer', 'moderator'].includes(
          userAccount.role
        ))
  );

  const setLanguage = async (lang: LanguageCode) => {
    setLanguageState(lang);
    if (user && user.emailVerified && userAccount) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          language: lang,
          updatedAt: new Date().toISOString(),
        });
        setUserAccount({ ...userAccount, language: lang });
      } catch (err) {
        console.error('Failed to persist language preference:', err);
      }
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const signInWithGoogle = async () => {
    if (signingIn) return;
    setAuthError(null);
    setAuthErrorCode(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthErrorCode(extractFirebaseAuthCode(err) || null);
      setAuthError(mapFirebaseAuthError(err, language));
    } finally {
      setSigningIn(false);
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  const switchRole = async (role: 'candidate' | 'employer') => {
    if (!user || !userAccount) return;
    if (!user.emailVerified) {
      setAuthErrorCode(null);
      setAuthError('Emeza imeyili ya konti yawe mbere yo guhindura uruhare.');
      return;
    }
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role,
        updatedAt: now,
      });
      setUserAccount({ ...userAccount, role: role as UserRole, updatedAt: now });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        authReady,
        userAccount,
        isAdmin,
        language,
        setLanguage,
        theme,
        toggleTheme,
        activeTab,
        setActiveTab,
        notifications,
        liveBanner,
        dismissLiveBanner: () => setLiveBanner(null),
        wsConnected,
        signingIn,
        signInWithGoogle,
        signOutUser,
        switchRole,
        authError,
        authErrorCode,
        clearAuthError: () => {
          setAuthError(null);
          setAuthErrorCode(null);
        },
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
