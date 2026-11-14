import React, { useEffect, useState } from 'react';
import { Check, Copy, FileSignature, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { apiFetch } from '../lib/api.ts';
import { useApp } from '../contexts/AppContext.tsx';
import { getT } from '../i18n/translations.ts';
import { SEED_JOBS } from '../lib/rwandaData.ts';
import type { AiMatchResult, JobListing, Resume } from '../types.ts';

export function AiJobMatchView() {
  const { user, language, signInWithGoogle } = useApp();
  const t = getT(language);

  const [jobs, setJobs] = useState<JobListing[]>(SEED_JOBS);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(SEED_JOBS[0]?.id || '');
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [cvText, setCvText] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<AiMatchResult | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [interviewItems, setInterviewItems] = useState<{ question: string; strategy: string }[]>([]);

  useEffect(() => {
    const unsubJobs = onSnapshot(
      query(collection(db, 'jobs'), where('status', '==', 'published')),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as JobListing);
          setJobs(list);
          if (list.length > 0 && !selectedJobId) setSelectedJobId(list[0].id);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'jobs')
    );

    let unsubResumes = () => {};
    if (user) {
      unsubResumes = onSnapshot(
        query(collection(db, 'resumes'), where('userId', '==', user.uid)),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as Resume);
          setResumes(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'resumes')
      );
    }

    return () => {
      unsubJobs();
      unsubResumes();
    };
  }, [user]);

  const handleSelectResume = (id: string) => {
    setSelectedResumeId(id);
    const found = resumes.find((r) => r.id === id);
    if (found) {
      setCvText(
        `${found.fullName}\n${found.summary}\nSkills: ${found.skills.join(', ')}\nExperience:\n${found.experienceText}\nEducation:\n${found.educationText}`
      );
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  const runAnalysis = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!selectedJob || !cvText.trim()) {
      setErrorMsg('Hitamo akazi kandi ushyiremo inyandiko ya CV yawe.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<AiMatchResult>('/api/ai/job-match', {
        method: 'POST',
        body: JSON.stringify({
          cvText,
          jobTitle: selectedJob.title,
          jobDescription: selectedJob.description,
          requirements: selectedJob.requirements,
          language,
        }),
      });
      setMatchResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const runCoverLetter = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!selectedJob || !cvText.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ coverLetter: string }>('/api/ai/cover-letter', {
        method: 'POST',
        body: JSON.stringify({
          cvText,
          jobTitle: selectedJob.title,
          companyName: selectedJob.companyName,
          jobDescription: selectedJob.description,
          language,
        }),
      });
      setCoverLetter(res.coverLetter);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cover letter generation failed');
    } finally {
      setLoading(false);
    }
  };

  const runInterviewPrep = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!selectedJob) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ items: { question: string; strategy: string }[] }>('/api/ai/interview-prep', {
        method: 'POST',
        body: JSON.stringify({
          cvText,
          jobTitle: selectedJob.title,
          jobDescription: selectedJob.description,
          language,
        }),
      });
      setInterviewItems(res.items || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Interview prep failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.ai.title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.ai.subtitle}</p>
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{t.ai.truthGuard}</span>
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.ai.selectJob}</label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} — {j.companyName}
                </option>
              ))}
            </select>
          </div>

          {resumes.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.ai.selectResume}</label>
              <select
                value={selectedResumeId}
                onChange={(e) => handleSelectResume(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- Hitamo CV yabitswe --</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} (v{r.versionCount})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.ai.customCvText}</label>
            <textarea
              rows={9}
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder="Shyiramo ubumenyi bwawe, amashuri n'ubunararibonye bw'ukuri..."
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={runAnalysis}
              className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? '...' : t.ai.analyzeBtn}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={runCoverLetter}
                className="py-2 px-3 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center justify-center gap-1.5"
              >
                <FileSignature className="w-3.5 h-3.5" />
                {t.ai.coverLetterBtn}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={runInterviewPrep}
                className="py-2 px-3 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {t.ai.interviewBtn}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          {matchResult && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">{t.ai.atsScore}</p>
                    <p className="text-4xl font-bold text-emerald-600 tabular-nums">{matchResult.atsScore}%</p>
                  </div>
                  <p className="text-xs text-slate-500 max-w-xs text-right">{matchResult.truthfulnessNotice}</p>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      matchResult.atsScore >= 75
                        ? 'bg-emerald-600'
                        : matchResult.atsScore >= 50
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, matchResult.atsScore))}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t.ai.matchedSkills}</h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    {matchResult.matchedSkills.join(' · ') || '-'}
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t.ai.missingKeywords}</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {matchResult.missingKeywords.join(' · ') || '-'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">Skills Gap</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {matchResult.skillsGapSummary}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t.ai.recommendations}</h3>
                <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">
                  {matchResult.honestRecommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {coverLetter && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.ai.coverLetterBtn}</h3>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(coverLetter);
                    setCopiedLetter(true);
                    setTimeout(() => setCopiedLetter(false), 2000);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1"
                >
                  {copiedLetter ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLetter ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                {coverLetter}
              </p>
            </div>
          )}

          {interviewItems.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.ai.interviewBtn}</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {interviewItems.map((item, idx) => (
                  <div key={idx} className="py-3 space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {idx + 1}. {item.question}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{item.strategy}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
