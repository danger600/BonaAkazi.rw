import React, { useEffect, useState } from 'react';
import { CheckCircle2, Lock, Receipt, RefreshCw, ShieldAlert } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { apiFetch } from '../lib/api.ts';
import { useApp } from '../contexts/AppContext.tsx';
import { getT } from '../i18n/translations.ts';
import { DEFAULT_PRICING_PACKAGES } from '../lib/rwandaData.ts';
import type { PaymentRecord, PricingPackage } from '../types.ts';

interface PricingMomoViewProps {
  preselectedPackageId?: string;
  preselectedTargetId?: string;
}

export function PricingMomoView({ preselectedPackageId, preselectedTargetId }: PricingMomoViewProps) {
  const { user, language, signInWithGoogle } = useApp();
  const t = getT(language);

  const [packages, setPackages] = useState<PricingPackage[]>(DEFAULT_PRICING_PACKAGES);
  const [selectedPkgId, setSelectedPkgId] = useState(preselectedPackageId || 'employer_featured');
  const [targetId, setTargetId] = useState(preselectedTargetId || '');
  const [payerMsisdn, setPayerMsisdn] = useState('078');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [activePayment, setActivePayment] = useState<PaymentRecord | null>(null);
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPackageId) setSelectedPkgId(preselectedPackageId);
    if (preselectedTargetId) setTargetId(preselectedTargetId);
  }, [preselectedPackageId, preselectedTargetId]);

  useEffect(() => {
    const unsubPkg = onSnapshot(
      query(collection(db, 'pricing_config'), where('active', '==', true)),
      (snap) => {
        if (!snap.empty) {
          setPackages(snap.docs.map((d) => d.data() as PricingPackage));
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pricing_config')
    );
    return () => unsubPkg();
  }, []);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ credentialsConfigured: boolean }>('/api/momo/config')
      .then((res) => setCredentialsConfigured(res.credentialsConfigured))
      .catch(() => {});

    apiFetch<{ payments: PaymentRecord[] }>('/api/momo/my-payments')
      .then((res) => {
        if (res.payments?.length) {
          setPayments((prev) => {
            const map = new Map<string, PaymentRecord>();
            for (const p of prev) map.set(p.id, p);
            for (const p of res.payments) map.set(p.id, p);
            return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          });
        }
      })
      .catch(() => {});

    const unsubPay = onSnapshot(
      query(collection(db, 'payments'), where('payerUid', '==', user.uid)),
      (snap) => {
        const fromDb = snap.docs.map((d) => d.data() as PaymentRecord);
        setPayments((prev) => {
          const map = new Map<string, PaymentRecord>();
          for (const p of prev) map.set(p.id, p);
          for (const p of fromDb) map.set(p.id, p);
          return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );
    return () => unsubPay();
  }, [user]);

  const upsertLocalPayment = (payment: PaymentRecord) => {
    setActivePayment(payment);
    setPayments((prev) => {
      const map = new Map<string, PaymentRecord>();
      for (const p of prev) map.set(p.id, p);
      map.set(payment.id, payment);
      return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  };

  const selectedPkg = packages.find((p) => p.id === selectedPkgId) || packages[0];

  const getPackageTitle = (pkg: PricingPackage) => {
    if (language === 'en') return pkg.nameEn;
    if (language === 'fr') return pkg.nameFr;
    return pkg.nameRw;
  };

  const getPackageDesc = (pkg: PricingPackage) => {
    if (language === 'en') return pkg.descriptionEn || '';
    if (language === 'fr') return pkg.descriptionFr || '';
    return pkg.descriptionRw || '';
  };

  const isValidClientMsisdn = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    const normalized =
      digits.startsWith('2507') && digits.length === 12
        ? digits
        : digits.startsWith('07') && digits.length === 10
          ? `250${digits.slice(1)}`
          : digits.startsWith('7') && digits.length === 9
            ? `250${digits}`
            : '';
    return /^2507[8923]\d{7}$/.test(normalized);
  };

  const handleRequestToPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!isValidClientMsisdn(payerMsisdn)) {
      setErrorMsg(
        language === 'en'
          ? 'Please enter a complete 10-digit Rwandan MTN MoMo number (e.g. 0788123456 or 079XXXXXXX).'
          : language === 'fr'
            ? 'Veuillez saisir un numéro MTN MoMo rwandais complet à 10 chiffres (ex: 0788123456).'
            : "Shyiramo nimero yawe ya MTN MoMo yuzuye y'u Rwanda (imibare 10, urugero: 0788123456 cyangwa 079XXXXXXX)."
      );
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await apiFetch<{
        payment: PaymentRecord;
        credentialsConfigured: boolean;
      }>('/api/momo/request-to-pay', {
        method: 'POST',
        body: JSON.stringify({
          payerMsisdn,
          packageId: selectedPkg.id,
          targetId,
          idempotencyKey,
        }),
      });
      upsertLocalPayment(res.payment);
      setCredentialsConfigured(res.credentialsConfigured);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Kohereza ubusabe bwa MTN MoMo byananiranye. Ongera ugerageze.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyStatus = async (referenceId: string, sandboxOutcome?: 'SUCCESSFUL' | 'FAILED') => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = sandboxOutcome ? `?sandboxOutcome=${sandboxOutcome}` : '';
      const res = await apiFetch<{ payment: PaymentRecord }>(
        `/api/momo/status/${encodeURIComponent(referenceId)}${qs}`
      );
      upsertLocalPayment(res.payment);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Status check failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.momo.title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.legal.noPaidGuarantee}</p>
      </div>

      {/* Pricing Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.map((pkg) => {
          const isSelected = pkg.id === selectedPkg.id;
          return (
            <div
              key={pkg.id}
              onClick={() => setSelectedPkgId(pkg.id)}
              className={`cursor-pointer rounded-xl p-6 border transition-colors flex flex-col justify-between gap-4 bg-white dark:bg-slate-900 ${
                isSelected
                  ? 'border-emerald-600 ring-1 ring-emerald-600'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              <div className="space-y-2">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {pkg.audience === 'employer' ? 'Umukoresha (Employer)' : 'Umukandida (Optional)'} ·{' '}
                  <span className="tabular-nums">{pkg.durationDays} iminsi</span>
                </p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{getPackageTitle(pkg)}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{getPackageDesc(pkg)}</p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {pkg.priceRwf.toLocaleString()} RWF
                </span>
                <span className="text-xs font-semibold text-emerald-600">
                  {isSelected ? 'Byatoranyijwe ✓' : 'Hitamo'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* MTN MoMo Rwanda Checkout Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleRequestToPay}
          className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="p-4 rounded-lg bg-[#FFCC00]/20 border border-[#FFCC00] text-slate-900 dark:text-slate-100 space-y-1">
            <p className="text-xs font-bold">{t.momo.receiverLabel} <span className="font-mono tabular-nums">0795547233</span></p>
            <p className="text-xs opacity-90">{t.momo.receiverNote}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.momo.payerPhone}</label>
            <input
              type="tel"
              required
              value={payerMsisdn}
              onChange={(e) => setPayerMsisdn(e.target.value)}
              placeholder="0788123456"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
            />
          </div>

          <div className="flex items-center justify-between py-2 border-y border-slate-100 dark:border-slate-800 text-sm">
            <span className="text-slate-600 dark:text-slate-300">{getPackageTitle(selectedPkg)}</span>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">
              {selectedPkg.priceRwf.toLocaleString()} RWF
            </span>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs text-rose-700 dark:text-rose-200">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg bg-[#FFCC00] text-[#0F172A] font-bold text-sm hover:brightness-95 transition-all disabled:opacity-50"
          >
            {loading ? '...' : t.momo.initiateBtn}
          </button>

          <p className="text-xs text-slate-500 flex items-start gap-2 pt-1">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{t.momo.securityRule}</span>
          </p>
        </form>

        {/* Verification & Active Transaction Panel */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            Igenzura ry'Ubwishyu (Server Verification)
          </h2>

          {activePayment ? (
            <div className="space-y-4 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-500">{activePayment.referenceId}</span>
                <span className="font-bold uppercase text-emerald-600">{activePayment.status}</span>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {activePayment.amountRwf.toLocaleString()} RWF → {activePayment.receiverMsisdn} ({activePayment.environment})
              </p>

              {activePayment.status === 'pending' && (
                <div className="space-y-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{t.momo.checkingStatus}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleVerifyStatus(activePayment.referenceId)}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F172A] text-white inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t.momo.pollStatusBtn}
                    </button>
                    {!credentialsConfigured && (
                      <>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleVerifyStatus(activePayment.referenceId, 'SUCCESSFUL')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
                        >
                          Sandbox: Simulate SUCCESSFUL
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleVerifyStatus(activePayment.referenceId, 'FAILED')}
                          className="px-3 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white"
                        >
                          Sandbox: Simulate FAILED
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activePayment.status === 'successful' && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {t.momo.receipt}: {activePayment.receiptNumber}
                  </p>
                  <p className="font-mono">Tx ID: {activePayment.momoFinancialTransactionId}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Ohereza ubusabe bwo kwishyura kugira ngo urebe uko seriveri igenzura iyemeza rya MTN MoMo.
            </p>
          )}

          {/* Ledger Table */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">{t.momo.ledgerTitle}</h3>
            {payments.length === 0 ? (
              <p className="text-xs text-slate-500">Nta bwishyu burakorwa.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {payments.slice(0, 6).map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white tabular-nums">
                        {p.amountRwf.toLocaleString()} RWF · {p.serviceType}
                      </p>
                      <p className="text-slate-500 font-mono">{p.receiptNumber || p.referenceId.slice(0, 12)}</p>
                    </div>
                    <span className="font-semibold uppercase text-slate-700 dark:text-slate-300">{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
