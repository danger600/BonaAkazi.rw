import React, { useEffect, useState } from 'react';
import { Bell, BookmarkCheck, Briefcase, CheckCircle2, Plus, Trash2, UserCheck } from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { useApp } from '../contexts/AppContext.tsx';
import { getT } from '../i18n/translations.ts';
import { RWANDA_DISTRICTS } from '../lib/rwandaData.ts';
import type {
  CandidateProfile,
  CertificationItem,
  EducationItem,
  ExperienceItem,
  JobAlert,
  JobApplication,
  SavedJob,
} from '../types.ts';

export function CandidatePortalView() {
  const { user, language, signInWithGoogle, setActiveTab } = useApp();
  const t = getT(language);

  const [subTab, setSubTab] = useState<'profile' | 'applications' | 'saved' | 'alerts'>('profile');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [savedBanner, setSavedBanner] = useState(false);

  // Profile state
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [district, setDistrict] = useState('Gasabo');
  const [yearsExperience, setYearsExperience] = useState(2);
  const [availability, setAvailability] = useState<CandidateProfile['availability']>('immediate');
  const [skillsText, setSkillsText] = useState('');
  const [education, setEducation] = useState<EducationItem[]>([]);
  const [experience, setExperience] = useState<ExperienceItem[]>([]);
  const [certifications, setCertifications] = useState<CertificationItem[]>([]);

  useEffect(() => {
    if (!user) return;

    getDoc(doc(db, 'profiles', user.uid))
      .then((snap) => {
        if (snap.exists()) {
          const p = snap.data() as CandidateProfile;
          setHeadline(p.headline || '');
          setSummary(p.summary || '');
          setDistrict(p.district || 'Gasabo');
          setYearsExperience(p.yearsExperience || 0);
          setAvailability(p.availability || 'immediate');
          setSkillsText((p.skills || []).join(', '));
          setEducation(p.education || []);
          setExperience(p.experience || []);
          setCertifications(p.certifications || []);
        }
      })
      .catch((err) => handleFirestoreError(err, OperationType.GET, `profiles/${user.uid}`));

    const unsubApps = onSnapshot(
      query(collection(db, 'applications'), where('candidateId', '==', user.uid)),
      (snap) =>
        setApplications(
          snap.docs
            .map((d) => d.data() as JobApplication)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'applications')
    );

    const unsubSaved = onSnapshot(
      collection(db, 'users', user.uid, 'saved_jobs'),
      (snap) => setSavedJobs(snap.docs.map((d) => d.data() as SavedJob)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/saved_jobs`)
    );

    const unsubAlerts = onSnapshot(
      collection(db, 'users', user.uid, 'alerts'),
      (snap) => setAlerts(snap.docs.map((d) => d.data() as JobAlert)),
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/alerts`)
    );

    return () => {
      unsubApps();
      unsubSaved();
      unsubAlerts();
    };
  }, [user]);

  if (!user) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-4 max-w-xl mx-auto">
        <UserCheck className="w-10 h-10 text-emerald-600 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t.auth.authRequiredTitle}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.auth.authRequiredDesc}</p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {t.auth.signIn}
        </button>
      </div>
    );
  }

  const [actionError, setActionError] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!user.emailVerified) {
      setActionError('Emeza imeyili yawe mbere yo kubika umwirondoro.');
      return;
    }
    const clampedYears = Math.min(60, Math.max(0, Math.round(Number(yearsExperience) || 0)));
    const payload: CandidateProfile = {
      userId: user.uid,
      headline: headline.trim().slice(0, 160),
      summary: summary.trim().slice(0, 2500),
      district: (district || 'Gasabo').slice(0, 64),
      yearsExperience: clampedYears,
      availability,
      education: education.slice(0, 20).map((ed) => ({
        ...ed,
        institution: ed.institution.slice(0, 140),
        degree: ed.degree.slice(0, 140),
        field: (ed.field || '').slice(0, 120),
        startYear: (ed.startYear || '').slice(0, 16),
        endYear: (ed.endYear || '').slice(0, 16),
      })),
      experience: experience.slice(0, 20).map((ex) => ({
        ...ex,
        company: ex.company.slice(0, 140),
        role: ex.role.slice(0, 140),
        period: (ex.period || '').slice(0, 64),
        highlights: (ex.highlights || '').slice(0, 600),
      })),
      skills: skillsText
        .split(',')
        .map((s) => s.trim().slice(0, 64))
        .filter(Boolean)
        .slice(0, 50),
      certifications: certifications.slice(0, 20),
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'profiles', user.uid), payload);
      setYearsExperience(clampedYears);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 4000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Saving profile failed');
      handleFirestoreError(err, OperationType.WRITE, `profiles/${user.uid}`);
    }
  };

  const handleWithdrawApp = async (appId: string) => {
    setActionError(null);
    if (!user.emailVerified) {
      setActionError('Emeza imeyili yawe mbere yo guhindura dosiye.');
      return;
    }
    try {
      await updateDoc(doc(db, 'applications', appId), {
        status: 'withdrawn',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to withdraw application');
      handleFirestoreError(err, OperationType.UPDATE, `applications/${appId}`);
    }
  };

  const handleRemoveSavedJob = async (jobId: string) => {
    setActionError(null);
    if (!user.emailVerified) {
      setActionError('Emeza imeyili yawe mbere yo gusiba umurimo wabitswe.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'saved_jobs', jobId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove saved job');
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/saved_jobs/${jobId}`);
    }
  };

  const handleRemoveAlert = async (alertId: string) => {
    setActionError(null);
    if (!user.emailVerified) {
      setActionError('Emeza imeyili yawe mbere yo gusiba imenyeshwa.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'alerts', alertId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove job alert');
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/alerts/${alertId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.candidate.title}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {user.displayName} · {user.email}
          </p>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {([
            ['profile', t.candidate.profileTab],
            ['applications', `${t.candidate.applicationsTab} (${applications.length})`],
            ['saved', `${t.candidate.savedTab} (${savedJobs.length})`],
            ['alerts', `${t.candidate.alertsTab} (${alerts.length})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                subTab === key
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {savedBanner && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{t.candidate.profileSaved}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-200">
          {actionError}
        </div>
      )}

      {subTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.candidate.headline}
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Full-Stack Software Engineer / Certified Accountant"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.candidate.district}
                </label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {RWANDA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.candidate.yearsExp}
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(Number(e.target.value))}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.candidate.availability}
                </label>
                <select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value as CandidateProfile['availability'])}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  <option value="immediate">Ako kanya</option>
                  <option value="two_weeks">Ibyumweru 2</option>
                  <option value="one_month">Ukwezi 1</option>
                  <option value="not_looking">Ndategereje</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t.candidate.summary}
            </label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {t.candidate.skillsLabel}
            </label>
            <input
              type="text"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder="React, TypeScript, Financial Audit, IFRS, Project Management"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>

          {/* Education & Experience sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Amashuri (Education)</h3>
                <button
                  type="button"
                  onClick={() =>
                    setEducation([
                      ...education,
                      { id: crypto.randomUUID(), institution: '', degree: '', field: '', startYear: '2019', endYear: '2023' },
                    ])
                  }
                  className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ongeraho
                </button>
              </div>
              {education.map((edu, idx) => (
                <div key={edu.id} className="grid grid-cols-2 gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <input
                    type="text"
                    placeholder="Kaminuza / Ishuri"
                    value={edu.institution}
                    onChange={(e) => {
                      const next = [...education];
                      next[idx].institution = e.target.value;
                      setEducation(next);
                    }}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    placeholder="Impamyabumenyi (Degree)"
                    value={edu.degree}
                    onChange={(e) => {
                      const next = [...education];
                      next[idx].degree = e.target.value;
                      setEducation(next);
                    }}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ubunararibonye (Experience)</h3>
                <button
                  type="button"
                  onClick={() =>
                    setExperience([
                      ...experience,
                      { id: crypto.randomUUID(), company: '', role: '', period: '2023 - 2026', highlights: '' },
                    ])
                  }
                  className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ongeraho
                </button>
              </div>
              {experience.map((exp, idx) => (
                <div key={exp.id} className="grid grid-cols-2 gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <input
                    type="text"
                    placeholder="Ikigo (Company)"
                    value={exp.company}
                    onChange={(e) => {
                      const next = [...experience];
                      next[idx].company = e.target.value;
                      setExperience(next);
                    }}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="text"
                    placeholder="Umwanya (Role)"
                    value={exp.role}
                    onChange={(e) => {
                      const next = [...experience];
                      next[idx].role = e.target.value;
                      setExperience(next);
                    }}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {t.candidate.saveProfile}
            </button>
          </div>
        </form>
      )}

      {subTab === 'applications' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {applications.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Briefcase className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-500">Nta dosiye y'akazi uratanga.</p>
              <button
                type="button"
                onClick={() => setActiveTab('jobs')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
              >
                {t.hero.primaryCta}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <tr>
                    <th className="p-4">Umwanya / Ikigo</th>
                    <th className="p-4">Imiterere</th>
                    <th className="p-4">Itariki</th>
                    <th className="p-4 text-right">Igikorwa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{app.jobTitle}</p>
                        <p className="text-xs text-slate-500">{app.companyName}</p>
                        {app.interviewDate && (
                          <p className="text-xs text-emerald-600 mt-1 tabular-nums">
                            Ikiganiro: {app.interviewDate}
                          </p>
                        )}
                      </td>
                      <td className="p-4 font-medium text-xs">
                        {t.candidate.statusLabels[app.status]}
                      </td>
                      <td className="p-4 text-xs text-slate-500 tabular-nums">
                        {app.createdAt.slice(0, 10)}
                      </td>
                      <td className="p-4 text-right">
                        {app.status === 'submitted' && (
                          <button
                            type="button"
                            onClick={() => handleWithdrawApp(app.id)}
                            className="text-xs text-rose-600 hover:underline font-medium"
                          >
                            {t.candidate.withdraw}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'saved' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {savedJobs.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <BookmarkCheck className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-500">Nta murimo urabika.</p>
            </div>
          ) : (
            savedJobs.map((s) => (
              <div key={s.jobId} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{s.jobTitle}</p>
                  <p className="text-xs text-slate-500">{s.companyName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSavedJob(s.jobId)}
                  className="p-2 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {subTab === 'alerts' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {alerts.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Bell className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-500">Nta menyesha ry'akazi urashyiraho.</p>
            </div>
          ) : (
            alerts.map((al) => (
              <div key={al.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{al.keywords}</p>
                  <p className="text-xs text-slate-500">
                    {al.district} · {al.category} · {al.frequency}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAlert(al.id)}
                  className="p-2 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
