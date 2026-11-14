import React, { useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';
import { useApp } from '../contexts/AppContext.tsx';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { language } = useApp();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const label =
    language === 'en'
      ? 'Install App'
      : language === 'fr'
        ? 'Installer l\'App'
        : 'Shyira muri Telefone';

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5" />
        {label}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          {label} (iOS)
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Shyira BonaAkazi.rw kuri iPhone / iPad
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Kanda akamenyetso ka <strong>Share</strong> muri Safari.<br />
                2. Hitamo <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white"
              >
                Funga
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Nta murandasi (Offline) — Uri kubona amakuru yabitswe.</span>
    </div>
  );
};
