import React, { Component, useState } from 'react';
import { Bell, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './lib/firebase.ts';
import { AppProvider, useApp } from './contexts/AppContext.tsx';
import { getT } from './i18n/translations.ts';
import { JobBoardView } from './components/JobBoardView.tsx';
import { CandidatePortalView } from './components/CandidatePortalView.tsx';
import { CvBuilderView } from './components/CvBuilderView.tsx';
import { AiJobMatchView } from './components/AiJobMatchView.tsx';
import { EmployerPortalView } from './components/EmployerPortalView.tsx';
import { PricingMomoView } from './components/PricingMomoView.tsx';
import { AdminDashboardView } from './components/AdminDashboardView.tsx';
import { LegalComplianceView } from './components/LegalComplianceView.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton.tsx';
import type { AppTab, LanguageCode } from './types.ts';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 text-slate-900">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-bold">Habaye ikibazo muri sisitemu</h2>
            <p className="text-xs text-slate-600 font-mono break-all">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
            >
              Ongera ufungure urupapuro
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  const {
    user,
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
    dismissLiveBanner,
    signingIn,
    signInWithGoogle,
    signOutUser,
    switchRole,
    authError,
    clearAuthError,
  } = useApp();

  const t = getT(language);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [checkoutPkg, setCheckoutPkg] = useState<string | undefined>(undefined);
  const [checkoutTargetId, setCheckoutTargetId] = useState<string | undefined>(undefined);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const primaryNav: { id: AppTab; label: string }[] = [
    { id: 'jobs', label: t.nav.jobs },
    { id: 'candidate', label: t.nav.candidate },
    { id: 'cv_builder', label: t.nav.cvBuilder },
    { id: 'ai_match', label: t.nav.aiMatch },
    { id: 'employer', label: t.nav.employer },
  ];

  const handleRequestMomoCheckout = (packageId: string, targetJobId: string) => {
    setCheckoutPkg(packageId);
    setCheckoutTargetId(targetJobId);
    setActiveTab('pricing');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="no-print sticky top-0 z-40 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('jobs')}
            className="text-lg font-extrabold tracking-tight text-[#0F172A] dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.brand}
          </button>

          {/* Zone 2: 5 Concise single-line navigation links */}
          <nav className="hidden lg:flex items-center gap-6">
            {primaryNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                  activeTab === item.id
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={signOutUser}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <span className="max-w-[140px] truncate">{userAccount?.displayName || user.displayName}</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={signInWithGoogle}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {signingIn ? '...' : t.auth.signIn}
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1">
            {[
              ...primaryNav,
              { id: 'pricing' as AppTab, label: t.nav.pricing },
              ...(isAdmin ? [{ id: 'admin' as AppTab, label: t.nav.admin }] : []),
              { id: 'legal' as AppTab, label: t.nav.legal },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  activeTab === item.id
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Workspace Utility Sub-bar (Language, Theme, Secondary Modules, Live Alerts) */}
      <div className="no-print border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('pricing')}
              className={`font-semibold whitespace-nowrap ${
                activeTab === 'pricing'
                  ? 'text-emerald-700 dark:text-emerald-400 underline'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.nav.pricing}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('legal')}
              className={`font-semibold whitespace-nowrap ${
                activeTab === 'legal'
                  ? 'text-emerald-700 dark:text-emerald-400 underline'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.nav.legal}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`font-semibold whitespace-nowrap ${
                  activeTab === 'admin'
                    ? 'text-emerald-700 dark:text-emerald-400 underline'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.nav.admin}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user && userAccount && (userAccount.role === 'candidate' || userAccount.role === 'employer') && (
              <button
                type="button"
                onClick={() =>
                  switchRole(userAccount.role === 'candidate' ? 'employer' : 'candidate')
                }
                className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-medium whitespace-nowrap"
              >
                {t.auth.accountRole}:{' '}
                {userAccount.role === 'candidate' ? t.auth.candidate : t.auth.employer}
              </button>
            )}

            {/* Language Switcher (Kinyarwanda Primary) */}
            <div className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
              {(['rw', 'en', 'fr'] as LanguageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={`px-2 py-1 font-semibold uppercase whitespace-nowrap ${
                    language === code
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>

            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 inline-flex items-center gap-1"
                  aria-label={t.notifications.title}
                >
                  <Bell className="w-3.5 h-3.5" />
                  {unreadCount > 0 && (
                    <span className="font-bold text-emerald-600 tabular-nums">{unreadCount}</span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-4 z-50 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="font-bold text-xs">{t.notifications.title}</span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-500 py-3">{t.notifications.empty}</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              if (!n.read) {
                                updateDoc(doc(db, 'notifications', n.id), { read: true }).catch((err) => {
                                  console.warn('Notification mark-read failed:', err);
                                });
                              }
                              if (n.linkTab) setActiveTab(n.linkTab);
                              setNotifOpen(false);
                            }}
                            className={`py-2.5 cursor-pointer ${n.read ? 'opacity-60' : 'font-medium'}`}
                          >
                            <p className="text-xs font-semibold">{n.title}</p>
                            <p className="text-xs text-slate-500">{n.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <PWAInstallButton />

            <button
              type="button"
              onClick={toggleTheme}
              className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Real-time WebSocket Database Event Banner */}
      {liveBanner && (
        <div className="no-print bg-[#0F172A] text-white text-xs py-2 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <span>
              {t.notifications.liveLabel}: {liveBanner.type} —{' '}
              {String(
                liveBanner.payload?.title ||
                  liveBanner.payload?.jobTitle ||
                  liveBanner.payload?.receiptNumber ||
                  ''
              )}
            </span>
            <button type="button" onClick={dismissLiveBanner} className="underline">
              Funga
            </button>
          </div>
        </div>
      )}

      {authError && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div
            role="alert"
            className="flex items-center justify-between gap-4 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-xs font-medium text-amber-900 dark:text-amber-100"
          >
            <span>{authError}</span>
            <button
              type="button"
              onClick={clearAuthError}
              className="text-amber-800 dark:text-amber-200 underline shrink-0"
            >
              Funga
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'jobs' && <JobBoardView />}
        {activeTab === 'candidate' && <CandidatePortalView />}
        {activeTab === 'cv_builder' && <CvBuilderView />}
        {activeTab === 'ai_match' && <AiJobMatchView />}
        {activeTab === 'employer' && (
          <EmployerPortalView onRequestMomoCheckout={handleRequestMomoCheckout} />
        )}
        {activeTab === 'pricing' && (
          <PricingMomoView
            preselectedPackageId={checkoutPkg}
            preselectedTargetId={checkoutTargetId}
          />
        )}
        {activeTab === 'admin' && <AdminDashboardView />}
        {activeTab === 'legal' && <LegalComplianceView />}
      </main>

      {/* Quiet Footer */}
      <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="space-y-1">
            <p className="font-bold text-slate-800 dark:text-slate-200">
              BonaAkazi.rw · Kigali, Rwanda · hello@bonaakazi.rw
            </p>
            <p>{t.legal.lawBadge}</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => setActiveTab('jobs')} className="hover:underline">
              {t.nav.jobs}
            </button>
            <button type="button" onClick={() => setActiveTab('pricing')} className="hover:underline">
              {t.nav.pricing}
            </button>
            <button type="button" onClick={() => setActiveTab('legal')} className="hover:underline">
              {t.nav.legal}
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:underline font-semibold text-emerald-700 dark:text-emerald-400"
            >
              {t.portalSections.backToTop} ↑
            </button>
          </div>
        </div>
      </footer>
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}
