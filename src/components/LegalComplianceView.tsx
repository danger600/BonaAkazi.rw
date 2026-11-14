import React, { useEffect, useState } from 'react';
import { Download, Scale, ShieldCheck, Trash2 } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { useApp } from '../contexts/AppContext.tsx';
import { getT } from '../i18n/translations.ts';

export function LegalComplianceView() {
  const { user, language, signInWithGoogle } = useApp();
  const t = getT(language);

  const [consentGranted, setConsentGranted] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [privateInfo, setPrivateInfo] = useState<{ phone?: string; district?: string }>({});

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid, 'private', 'info'))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setConsentGranted(Boolean(data.consentAccepted));
          setPrivateInfo({
            phone: typeof data.phone === 'string' ? data.phone : undefined,
            district: typeof data.district === 'string' ? data.district : undefined,
          });
        }
      })
      .catch(() => {});
  }, [user]);

  const handleToggleConsent = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!user.emailVerified) {
      setStatusMsg('Emeza imeyili yawe mbere yo guhindura uburenganzira bw\'amakuru.');
      return;
    }
    const next = !consentGranted;
    const now = new Date().toISOString();
    // Firestore rules require every private-info write to contain the full
    // valid shape (uid + email + consent fields). Writing only the consent
    // fields with merge:true created an invalid document on first use and was
    // rejected with permission-denied.
    const payload: Record<string, unknown> = {
      uid: user.uid,
      email: (user.email || '').slice(0, 254),
      consentAccepted: next,
      consentUpdatedAt: now,
    };
    if (privateInfo.phone) payload.phone = privateInfo.phone.slice(0, 32);
    if (privateInfo.district) payload.district = privateInfo.district.slice(0, 64);
    try {
      await setDoc(doc(db, 'users', user.uid, 'private', 'info'), payload, { merge: true });
      const recId = `cons_${crypto.randomUUID().replace(/-/g, '')}`;
      await setDoc(doc(db, 'consent_records', recId), {
        id: recId,
        userId: user.uid,
        requestType: 'consent',
        granted: next,
        status: 'recorded',
        createdAt: now,
      });
      setConsentGranted(next);
      setStatusMsg(next ? 'Uburenganzira bw\'amakuru bwemejwe.' : 'Uburenganzira bw\'amakuru bwakuweho.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Consent update failed');
      handleFirestoreError(err, OperationType.WRITE, 'consent_records');
    }
  };

  const handleExportData = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    try {
      const [userSnap, profileSnap, privateSnap, resumesSnap, appsSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'profiles', user.uid)),
        getDoc(doc(db, 'users', user.uid, 'private', 'info')),
        getDocs(query(collection(db, 'resumes'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'applications'), where('candidateId', '==', user.uid))),
      ]);

      const exportBundle = {
        exportedAt: new Date().toISOString(),
        lawReference: 'Rwanda Law N° 058/2021 (Right of Data Access & Portability)',
        account: userSnap.exists() ? userSnap.data() : null,
        profile: profileSnap.exists() ? profileSnap.data() : null,
        privateInfo: privateSnap.exists() ? privateSnap.data() : null,
        resumes: resumesSnap.docs.map((d) => d.data()),
        applications: appsSnap.docs.map((d) => d.data()),
      };

      const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bonaakazi-my-data-${user.uid.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg('Amakuru yawe yose yakurikijwe mu buryo bwa JSON.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleRequestDeletion = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!user.emailVerified) {
      setStatusMsg('Emeza imeyili yawe mbere yo kohereza ubusabe bwo gusiba amakuru.');
      return;
    }
    const now = new Date().toISOString();
    const recId = `del_${crypto.randomUUID().replace(/-/g, '')}`;
    try {
      await setDoc(doc(db, 'consent_records', recId), {
        id: recId,
        userId: user.uid,
        requestType: 'data_deletion',
        granted: false,
        status: 'pending',
        createdAt: now,
      });
      setStatusMsg('Ubusabe bwo gusiba konti n\'amakuru bwanditswe (Law N° 058/2021).');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Deletion request failed');
      handleFirestoreError(err, OperationType.CREATE, `consent_records/${recId}`);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <Scale className="w-4 h-4" />
          <span>{t.legal.lawBadge}</span>
        </p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.legal.title}</h1>
        <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          {t.legal.disclaimer}
        </p>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            {t.legal.consentTitle}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{t.legal.consentText}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleToggleConsent}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
            >
              {consentGranted ? t.legal.revokeConsent : t.legal.grantConsent}
            </button>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Uburenganzira ku Makuru (Law N° 058/2021)</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Ushobora gukura amakuru yawe yose muri sisitemu cyangwa ugasaba ko asibwa burundu. Ntidusaba Indangamuntu (National ID) ku bushake budakenewe.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportData}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {t.legal.exportData}
            </button>
            <button
              type="button"
              onClick={handleRequestDeletion}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.legal.deleteRequest}
            </button>
          </div>
        </section>
      </div>

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Amasezerano y'Imikoreshereze (Terms & Labor Law N° 66/2018)</h2>
        <p>{t.legal.noPaidGuarantee}</p>
        <p>
          Abakoresha biyemeza gutangaza imyanya y'ukuri idasaba amafaranga abashaka akazi. Amakuru y'abakandida (CV, Imeyili, Telefone) abikwa mu gice kirinzwe n'amategeko y'umutekano (RBAC & Firestore PII Isolation) akamarana igihe cy'imyaka 2 nyuma yo guhagarika gukoresha urubuga keretse nyirayo asabye ko asibwa mbere.
        </p>
      </section>
    </div>
  );
}
