import React, { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, ShieldAlert, Users, Wallet } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { apiFetch, checkBackendHealth, resolveApiUrl } from '../lib/api.ts';
import { useApp } from '../contexts/AppContext.tsx';
import { getT } from '../i18n/translations.ts';
import { DEFAULT_PRICING_PACKAGES, SEED_COMPANIES, SEED_JOBS } from '../lib/rwandaData.ts';
import type {
  AuditLog,
  Company,
  FraudReport,
  IngestionRunStats,
  JobListing,
  PaymentRecord,
  PricingPackage,
  UserAccount,
  UserRole,
} from '../types.ts';

export function AdminDashboardView() {
  const { user, isAdmin, language } = useApp();
  const t = getT(language);

  const [subTab, setSubTab] = useState<'moderation' | 'users' | 'finance' | 'pricing' | 'audit'>('moderation');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [usersList, setUsersList] = useState<UserAccount[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [serverPayments, setServerPayments] = useState<PaymentRecord[]>([]);
  const [pricing, setPricing] = useState<PricingPackage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [serverAuditLogs, setServerAuditLogs] = useState<AuditLog[]>([]);
  const [fraudReports, setFraudReports] = useState<FraudReport[]>([]);
  const [ingestionStats, setIngestionStats] = useState<IngestionRunStats | null>(null);
  const [syncingJobs, setSyncingJobs] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;

    const u1 = onSnapshot(
      collection(db, 'companies'),
      (s) => setCompanies(s.docs.map((d) => d.data() as Company)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'companies')
    );
    const u2 = onSnapshot(
      query(collection(db, 'jobs'), orderBy('createdAt', 'desc')),
      (s) => setJobs(s.docs.map((d) => d.data() as JobListing)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'jobs')
    );
    const u3 = onSnapshot(
      collection(db, 'users'),
      (s) => setUsersList(s.docs.map((d) => d.data() as UserAccount)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );
    const u4 = onSnapshot(
      query(collection(db, 'payments'), orderBy('createdAt', 'desc')),
      (s) => setPayments(s.docs.map((d) => d.data() as PaymentRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );
    const u5 = onSnapshot(
      collection(db, 'pricing_config'),
      (s) => setPricing(s.docs.map((d) => d.data() as PricingPackage)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'pricing_config')
    );
    const u6 = onSnapshot(
      query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc')),
      (s) => setAuditLogs(s.docs.map((d) => d.data() as AuditLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
    );
    const u7 = onSnapshot(
      query(collection(db, 'fraud_reports'), orderBy('createdAt', 'desc')),
      (s) => setFraudReports(s.docs.map((d) => d.data() as FraudReport)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'fraud_reports')
    );

    checkBackendHealth()
      .then((health) => {
        if (!health.ok) return;
        apiFetch<{ payments: PaymentRecord[]; auditLogs: AuditLog[] }>('/api/momo/ledger')
          .then((res) => {
            setServerPayments(res.payments || []);
            setServerAuditLogs(res.auditLogs || []);
          })
          .catch(() => {});

        fetch(resolveApiUrl('/api/ingestion/status'))
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { stats?: IngestionRunStats } | null) => {
            if (d?.stats) setIngestionStats(d.stats);
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
    };
  }, [user, isAdmin]);

  const mergedPayments = useMemo(() => {
    const map = new Map<string, PaymentRecord>();
    for (const p of serverPayments) map.set(p.id, p);
    for (const p of payments) map.set(p.id, p);
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [payments, serverPayments]);

  const mergedAuditLogs = useMemo(() => {
    const map = new Map<string, AuditLog>();
    for (const l of serverAuditLogs) map.set(l.id, l);
    for (const l of auditLogs) map.set(l.id, l);
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [auditLogs, serverAuditLogs]);

  if (!user || !isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3 max-w-lg mx-auto">
        <ShieldAlert className="w-9 h-9 text-amber-600 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Uburenganzira bw'Ubuyobozi Burakenewe</h2>
        <p className="text-sm text-slate-500">
          Iki gice kigenewe Super Admin, Finance Manager, Recruitment Officer na Moderator gusa.
        </p>
      </div>
    );
  }

  const handleSeed = async () => {
    try {
      const batch = writeBatch(db);
      for (const pkg of DEFAULT_PRICING_PACKAGES) {
        batch.set(doc(db, 'pricing_config', pkg.id), pkg);
      }
      for (const comp of SEED_COMPANIES) {
        batch.set(doc(db, 'companies', comp.id), comp);
      }
      for (const job of SEED_JOBS) {
        batch.set(doc(db, 'jobs', job.id), job);
      }
      await batch.commit();
      await apiFetch('/api/seed', { method: 'POST' }).catch(() => {});
      setStatusBanner('Imirimo, ibigo n\'ibiciro by\'ibanze byinjijwe neza muri Firestore.');
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Seed failed');
    }
  };

  const handleRefund = async (paymentId: string) => {
    try {
      await apiFetch('/api/momo/refund', {
        method: 'POST',
        body: JSON.stringify({ paymentId, reason: 'Admin reconciliation refund' }),
      });
      setStatusBanner(`Payment ${paymentId} refunded.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Refund failed');
    }
  };

  const handleRunIngestion = async () => {
    setSyncingJobs(true);
    try {
      const res = await apiFetch<{ addedCount: number; stats: IngestionRunStats }>('/api/ingestion/run', {
        method: 'POST',
      });
      setIngestionStats(res.stats);
      setStatusBanner(
        `Auto-Sync irarangiye: hiyongereyeho imirimo ${res.addedCount}, ibihuye (duplicates) byirengagijwe: ${res.stats.duplicatesSkipped}.`
      );
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Auto-Sync failed');
    } finally {
      setSyncingJobs(false);
    }
  };

  const handleExportLedgerCsv = () => {
    const header = [
      'ReceiptNumber',
      'ReferenceId',
      'PayerMSISDN',
      'ReceiverMSISDN',
      'AmountRWF',
      'Currency',
      'ServiceType',
      'Status',
      'Environment',
      'CreatedAt',
    ].join(',');
    const rows = mergedPayments.map((p) =>
      [
        p.receiptNumber || '',
        p.referenceId,
        p.payerMsisdn,
        p.receiverMsisdn,
        p.amountRwf,
        p.currency,
        p.serviceType,
        p.status,
        p.environment,
        p.createdAt,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bonaakazi-momo-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCompanyStatus = async (companyId: string, verificationStatus: 'verified' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        verificationStatus,
        updatedAt: new Date().toISOString(),
      });
      setStatusBanner(`Ikigo cyahinduwe: ${verificationStatus}.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Company update failed');
      handleFirestoreError(err, OperationType.UPDATE, `companies/${companyId}`);
    }
  };

  const handleJobStatus = async (jobId: string, status: 'published' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), {
        status,
        updatedAt: new Date().toISOString(),
      });
      setStatusBanner(`Umwanya wahinduwe: ${status}.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Job status update failed');
      handleFirestoreError(err, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const handleUserRoleChange = async (targetUid: string, newRole: UserRole) => {
    const now = new Date().toISOString();
    const adminRoles: UserRole[] = [
      'admin',
      'super_admin',
      'finance_manager',
      'recruitment_officer',
      'moderator',
    ];
    const grantAdmin = adminRoles.includes(newRole);
    // Removable admin grants live in two places (`users.role` and
    // `admins/{uid}`). If an admin removed their own `users.role` while the
    // admins doc still existed, the stale grant would keep them an admin.
    // Handle that by removing the admins doc first and refusing self-demotion.
    if (targetUid === user?.uid && !grantAdmin) {
      setStatusBanner('Ntushobora kwikuraho uburenganzira bwa admin.');
      return;
    }
    try {
      if (!grantAdmin) {
        try {
          await deleteDoc(doc(db, 'admins', targetUid));
        } catch (err) {
          // A missing admins doc is fine; anything else must abort before the
          // role change so we never leave a stale admin grant behind.
          if ((err as { code?: string }).code !== 'not-found') throw err;
        }
      }
      await updateDoc(doc(db, 'users', targetUid), {
        role: newRole,
        updatedAt: now,
      });
      if (grantAdmin) {
        await setDoc(doc(db, 'admins', targetUid), { role: newRole, updatedAt: now });
      }
      setStatusBanner(`Uruhare rw'ukoresha rwahinduwe ruba ${newRole}.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'User role update failed');
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const handleToggleUserStatus = async (targetUid: string, currentStatus: UserAccount['status']) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateDoc(doc(db, 'users', targetUid), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      setStatusBanner(`Konti yahinduwe: ${nextStatus}.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'User status update failed');
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const handleUpdatePricing = async (pkg: PricingPackage, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const rounded = Math.max(0, Math.round(parsed));
    if (rounded === pkg.priceRwf) return;
    try {
      await updateDoc(doc(db, 'pricing_config', pkg.id), {
        priceRwf: rounded,
        updatedAt: new Date().toISOString(),
      });
      setStatusBanner(`Igiciro cya ${pkg.nameRw} cyahinduwe kiba ${rounded.toLocaleString()} RWF.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Pricing update failed');
      handleFirestoreError(err, OperationType.UPDATE, `pricing_config/${pkg.id}`);
    }
  };

  const handleResolveFraud = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'fraud_reports', reportId), { status: 'resolved' });
      setStatusBanner('Ikirego cyakemuriwe.');
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Fraud report update failed');
      handleFirestoreError(err, OperationType.UPDATE, `fraud_reports/${reportId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.admin.title}</h1>
          <p className="text-xs text-slate-500">RBAC · Moderation · Auto-Sync · MTN MoMo Reconciliation · Audit Trail</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={syncingJobs}
            onClick={handleRunIngestion}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingJobs ? 'animate-spin' : ''}`} />
            Auto-Sync Now ({ingestionStats?.totalIngested ?? 0})
          </button>
          <button
            type="button"
            onClick={handleSeed}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F172A] dark:bg-emerald-600 text-white whitespace-nowrap"
          >
            {t.admin.seedDataBtn}
          </button>
        </div>
      </div>

      {ingestionStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
            <p className="text-slate-500">Auto-Sync Imirimo Yinjijwe</p>
            <p className="text-lg font-bold tabular-nums mt-0.5">{ingestionStats.totalIngested}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
            <p className="text-slate-500">Duplicates Zarengejwe</p>
            <p className="text-lg font-bold tabular-nums mt-0.5">{ingestionStats.duplicatesSkipped}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
            <p className="text-slate-500">Igihe cy'Isuzuma</p>
            <p className="text-lg font-bold tabular-nums mt-0.5">Buri minota {ingestionStats.intervalMinutes}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5">
            <p className="text-slate-500">Inshuro iheruka (Last Sync)</p>
            <p className="text-xs font-mono mt-1">{ingestionStats.lastRunAt ? ingestionStats.lastRunAt.slice(0, 19).replace('T', ' ') : '-'}</p>
          </div>
        </div>
      )}

      {statusBanner && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200">
          {statusBanner}
        </div>
      )}

      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        {([
          ['moderation', t.admin.moderationTab],
          ['users', t.admin.usersTab],
          ['finance', t.admin.financeTab],
          ['pricing', t.admin.pricingTab],
          ['audit', t.admin.auditTab],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
              subTab === key
                ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'moderation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold">Ibigo ({companies.length})</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {companies.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-slate-500">
                      {c.district} · TIN: {c.tinNumber || '-'} · {c.verificationStatus}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCompanyStatus(c.id, 'verified')}
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold"
                    >
                      {t.admin.verifyCompany}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompanyStatus(c.id, 'rejected')}
                      className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold"
                    >
                      {t.admin.rejectCompany}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold">Imirimo & Amasoko ({jobs.length})</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {jobs.map((j) => (
                <div key={j.id} className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">{j.title}</p>
                    <p className="text-slate-500">
                      {j.companyName} · {j.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleJobStatus(j.id, 'published')}
                      className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold"
                    >
                      {t.admin.approveJob}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJobStatus(j.id, 'rejected')}
                      className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold"
                    >
                      {t.admin.rejectJob}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'users' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="p-4">Izina / UID</th>
                <th className="p-4">Uruhare (Role)</th>
                <th className="p-4">Imiterere</th>
                <th className="p-4 text-right">Igikorwa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {usersList.map((u) => (
                <tr key={u.uid}>
                  <td className="p-4">
                    <p className="font-semibold text-sm">{u.displayName}</p>
                    <p className="font-mono text-slate-500">{u.uid}</p>
                  </td>
                  <td className="p-4">
                    <select
                      value={u.role}
                      onChange={(e) => handleUserRoleChange(u.uid, e.target.value as UserRole)}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="candidate">candidate</option>
                      <option value="employer">employer</option>
                      <option value="recruitment_officer">recruitment_officer</option>
                      <option value="finance_manager">finance_manager</option>
                      <option value="moderator">moderator</option>
                      <option value="admin">admin</option>
                      <option value="super_admin">super_admin</option>
                    </select>
                  </td>
                  <td className="p-4 font-semibold">{u.status}</td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleUserStatus(u.uid, u.status)}
                      className="px-3 py-1 rounded border border-slate-300 dark:border-slate-700 font-semibold"
                    >
                      {u.status === 'active' ? t.admin.suspendUser : t.admin.activateUser}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'finance' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              MTN MoMo Merchant Account: <span className="font-mono font-bold text-slate-900 dark:text-white">0795547233</span> · Transactions ({mergedPayments.length})
            </p>
            <button
              type="button"
              onClick={handleExportLedgerCsv}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV (RRA Tax)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="p-4">Reference / Receipt</th>
                  <th className="p-4">Payer → Receiver</th>
                  <th className="p-4">Amafaranga</th>
                  <th className="p-4">Imiterere</th>
                  <th className="p-4 text-right">Reconciliation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {mergedPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="p-4">
                      <p className="font-semibold">{p.receiptNumber || '-'}</p>
                      <p className="font-mono text-slate-500">{p.referenceId}</p>
                    </td>
                    <td className="p-4 font-mono">
                      {p.payerMsisdn} → {p.receiverMsisdn}
                    </td>
                    <td className="p-4 font-bold tabular-nums">{p.amountRwf.toLocaleString()} RWF</td>
                    <td className="p-4 uppercase font-semibold">{p.status}</td>
                    <td className="p-4 text-right">
                      {p.status === 'successful' && (
                        <button
                          type="button"
                          onClick={() => handleRefund(p.id)}
                          className="px-3 py-1 rounded bg-rose-600 text-white font-semibold"
                        >
                          {t.admin.refundPayment}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'pricing' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            Ibiciro by'Amapaki (Admin Configurable)
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pricing.map((pkg) => (
              <div key={pkg.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">{pkg.nameRw}</p>
                  <p className="text-xs text-slate-500">{pkg.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={pkg.priceRwf}
                    onBlur={(e) => handleUpdatePricing(pkg, e.target.value)}
                    className="w-32 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 tabular-nums"
                  />
                  <span className="text-xs text-slate-500">RWF</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Audit Logs ({mergedAuditLogs.length})
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-96 overflow-y-auto">
              {mergedAuditLogs.map((log) => (
                <div key={log.id} className="py-2.5">
                  <p className="font-semibold">
                    {log.action} · <span className="font-mono text-slate-500">{log.resourceType}</span>
                  </p>
                  <p className="text-slate-600 dark:text-slate-300">{log.details}</p>
                  <p className="text-slate-400 tabular-nums">{log.createdAt}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold">Fraud Reports ({fraudReports.length})</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {fraudReports.map((rep) => (
                <div key={rep.id} className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{rep.targetId}</p>
                    <p className="text-slate-600 dark:text-slate-300">{rep.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleResolveFraud(rep.id)}
                    className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold"
                  >
                    {rep.status === 'resolved' ? 'Resolved' : 'Resolve'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
