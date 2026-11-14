import React, { useEffect, useState } from 'react';
import { Download, FileText, History, Printer, Sparkles, Upload } from 'lucide-react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { apiFetch } from '../lib/api.ts';
import { useApp } from '../contexts/AppContext.tsx';
import { getT } from '../i18n/translations.ts';
import type { LanguageCode, Resume } from '../types.ts';

export function CvBuilderView() {
  const { user, language, signInWithGoogle } = useApp();
  const t = getT(language);

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  const [title, setTitle] = useState('CV Yanjye Nyarwanda');
  const [cvLang, setCvLang] = useState<LanguageCode>('rw');
  const [template, setTemplate] = useState<Resume['template']>('executive');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('Kigali, Rwanda');
  const [summary, setSummary] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [experienceText, setExperienceText] = useState('');
  const [educationText, setEducationText] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [guidedMode, setGuidedMode] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!user) return;
    setFullName((prev) => prev || user.displayName || '');
    setEmail((prev) => prev || user.email || '');

    const q = query(collection(db, 'resumes'), where('userId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Resume)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setResumes(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'resumes')
    );
    return () => unsub();
  }, [user]);

  const loadResumeIntoEditor = (r: Resume) => {
    setActiveId(r.id);
    setTitle(r.title);
    setCvLang(r.language);
    setTemplate(r.template);
    setFullName(r.fullName);
    setEmail(r.email || '');
    setPhone(r.phone || '');
    setLocation(r.location || '');
    setSummary(r.summary);
    setSkillsText((r.skills || []).join(', '));
    setExperienceText(r.experienceText);
    setEducationText(r.educationText);
    setAiNotes(r.aiFeedback || '');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      // Extract clean readable characters for TXT, MD, or text-layer PDF/DOCX uploads
      const cleaned = text.replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F]/g, ' ').replace(/\s{3,}/g, '\n');
      setExperienceText((prev) =>
        (prev ? `${prev}\n\n${cleaned}` : cleaned).slice(0, 8000)
      );
      setStatusMsg(`Inyandiko ya "${file.name}" yinjijwe mu gice cy'ubunararibonye.`);
    } catch {
      setStatusMsg('Ntibyakunze gusoma iyi dosiye. Koresha TXT cyangwa wandike inyandiko muri CV.');
    }
  };

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!user.emailVerified) {
      setStatusMsg('Emeza imeyili ya konti yawe mbere yo kubika CV.');
      return;
    }
    const existing = resumes.find((r) => r.id === activeId);
    const id = existing ? existing.id : `cv_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const skillsArr = skillsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);

    const newVersionNum = existing ? Math.min(100, existing.versionCount + 1) : 1;
    const prevVersions = existing ? existing.versions : [];
    const safeSummary = summary.trim().slice(0, 3000);
    const safeExperience = experienceText.trim().slice(0, 8000);
    const nextVersions = [
      {
        version: newVersionNum,
        savedAt: now,
        note: `Version ${newVersionNum} (${cvLang.toUpperCase()})`,
        summary: safeSummary,
        experienceText: safeExperience,
        skills: skillsArr,
      },
      ...prevVersions,
    ].slice(0, 15);

    const payload: Resume = {
      id,
      userId: user.uid,
      title: (title.trim() || 'CV').slice(0, 160),
      language: cvLang,
      template,
      fullName: (fullName.trim() || user.displayName || 'Candidate').slice(0, 120),
      email: email.trim().slice(0, 254),
      phone: phone.trim().slice(0, 32),
      location: location.trim().slice(0, 100),
      summary: safeSummary,
      skills: skillsArr,
      experienceText: safeExperience,
      educationText: educationText.trim().slice(0, 4000),
      versionCount: newVersionNum,
      versions: nextVersions,
      aiFeedback: aiNotes.slice(0, 4000),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'resumes', id), payload);
      setActiveId(id);
      setStatusMsg(`CV yabitswe (Verisiyo #${newVersionNum}).`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `resumes/${id}`);
    }
  };

  const handleImproveWithAi = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setAiLoading(true);
    setStatusMsg(null);
    try {
      const result = await apiFetch<{
        improvedSummary: string;
        improvedExperienceText: string;
        editorialNotes: string;
      }>('/api/ai/improve-cv', {
        method: 'POST',
        body: JSON.stringify({
          summary,
          experienceText,
          skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean),
          language: cvLang,
        }),
      });
      setSummary(result.improvedSummary);
      setExperienceText(result.improvedExperienceText);
      setAiNotes(result.editorialNotes);
      setStatusMsg('AI yanoje imyandikire ya CV nta cyahimbwe.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'AI error');
    } finally {
      setAiLoading(false);
    }
  };

  const activeResume = resumes.find((r) => r.id === activeId);

  return (
    <div className="space-y-6">
      {/* Header banner with editorial photo */}
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-8 p-6 sm:p-8 flex flex-col justify-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.cv.title}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t.cv.honestAiNotice}</p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setActiveId('');
                setTitle('CV Nshya');
                setSummary('');
                setExperienceText('');
                setEducationText('');
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {t.cv.newCv}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F172A] dark:bg-emerald-600 text-white inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              {t.cv.printPdf}
            </button>
            <button
              type="button"
              onClick={() => {
                const html = `<html><head><meta charset="utf-8"><title>${fullName || 'CV'}</title></head><body style="font-family:sans-serif;padding:32px;"><h1>${fullName || 'Amazina'}</h1><p>${[location, phone, email].filter(Boolean).join(' · ')}</p><hr/><h3>${t.cv.summary}</h3><p>${summary.replace(/\n/g, '<br/>')}</p><h3>${t.cv.skills}</h3><p>${skillsText}</p><h3>${t.cv.experience}</h3><p>${experienceText.replace(/\n/g, '<br/>')}</p><h3>${t.cv.education}</h3><p>${educationText.replace(/\n/g, '<br/>')}</p></body></html>`;
                const blob = new Blob([html], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(title || 'cv').toLowerCase().replace(/\s+/g, '-')}.doc`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export DOC
            </button>
            <button
              type="button"
              onClick={() => {
                setGuidedMode((v) => !v);
                setStepIdx(0);
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border ${
                guidedMode
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              {guidedMode ? 'Uburyo Bwose (All Fields)' : 'Intambwe ku Yindi (Guided)'}
            </button>
          </div>
        </div>
        <div className="lg:col-span-4 min-h-[160px] bg-slate-100 dark:bg-slate-800">
          <img
            src="/src/assets/images/feature_cv_review_1794614731626.jpg"
            alt="Rwandan professional reviewing CV"
            referrerPolicy="no-referrer"
            className="w-full h-full lg:h-full object-cover"
          />
        </div>
      </div>

      {statusMsg && (
        <div className="no-print p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Editor */}
        <form
          onSubmit={handleSaveVersion}
          className="no-print lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          {resumes.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                CV Zanjye ({resumes.length})
              </label>
              <div className="flex flex-wrap gap-2">
                {resumes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => loadResumeIntoEditor(r)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      activeId === r.id
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 inline mr-1" />
                    {r.title} (v{r.versionCount})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1 space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t.cv.template}</label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value as Resume['template'])}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="executive">Executive</option>
                <option value="modern">Modern</option>
                <option value="minimal">Minimal</option>
                <option value="tech">Tech / Engineering</option>
                <option value="creative">Creative Portfolio</option>
              </select>
            </div>
            <div className="sm:col-span-1 space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t.cv.language}</label>
              <select
                value={cvLang}
                onChange={(e) => setCvLang(e.target.value as LanguageCode)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="rw">Kinyarwanda</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div className="sm:col-span-1 space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Izina rya CV</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {guidedMode && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {['1. Amakuru', '2. Incamake', '3. Ubumenyi', '4. Uburambe', '5. Amashuri'].map((lbl, idx) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => setStepIdx(idx)}
                    className={`px-2 py-1 rounded font-semibold ${
                      stepIdx === idx
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={stepIdx === 0}
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-40"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={stepIdx === 4}
                  onClick={() => setStepIdx((i) => Math.min(4, i + 1))}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          )}

          {(!guidedMode || stepIdx === 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder={t.cv.fullName}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="email"
                placeholder={t.cv.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder={t.cv.phone}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder={t.cv.location}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          {(!guidedMode || stepIdx === 1) && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t.cv.summary}</label>
              <textarea
                rows={3}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          {(!guidedMode || stepIdx === 2) && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t.cv.skills}</label>
              <input
                type="text"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                placeholder="React, Accounting, Project Management..."
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          {(!guidedMode || stepIdx === 3) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t.cv.experience}</label>
                <label className="text-xs text-emerald-600 cursor-pointer inline-flex items-center gap-1 font-medium">
                  <Upload className="w-3.5 h-3.5" />
                  Pakira Dosiye
                  <input type="file" accept=".txt,.md,.pdf,.docx" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
              <textarea
                rows={5}
                value={experienceText}
                onChange={(e) => setExperienceText(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          {(!guidedMode || stepIdx === 4) && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t.cv.education}</label>
              <textarea
                rows={3}
                value={educationText}
                onChange={(e) => setEducationText(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              disabled={aiLoading}
              onClick={handleImproveWithAi}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {aiLoading ? '...' : t.cv.improveWithAi}
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {t.cv.saveVersion}
            </button>
          </div>

          {aiNotes && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300">
              {aiNotes}
            </div>
          )}
        </form>

        {/* Right Live Printable Preview + Version History */}
        <div className="lg:col-span-6 space-y-6">
          <div
            className={`bg-white text-slate-900 border border-slate-200 rounded-xl p-8 space-y-5 ${
              template === 'executive'
                ? 'font-serif'
                : template === 'tech'
                  ? 'font-mono border-t-4 border-t-emerald-600'
                  : template === 'creative'
                    ? 'bg-gradient-to-br from-white to-emerald-50/40'
                    : template === 'modern'
                      ? 'border-t-4 border-t-[#0F172A]'
                      : ''
            }`}
          >
            <div
              className={`pb-4 ${
                template === 'creative'
                  ? 'bg-[#0F172A] text-white -m-8 mb-4 p-8 rounded-t-xl'
                  : 'border-b border-slate-200'
              }`}
            >
              <h2 className={`text-2xl font-bold ${template === 'creative' ? 'text-white' : 'text-[#0F172A]'}`}>
                {fullName || 'Amazina Yawe'}
              </h2>
              <p className={`text-xs mt-1 ${template === 'creative' ? 'text-emerald-300' : 'text-slate-600'}`}>
                {[location, phone, email].filter(Boolean).join(' · ')}
              </p>
            </div>

            {summary && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold tracking-wide text-emerald-700">
                  {t.cv.summary}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
              </div>
            )}

            {skillsText && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold tracking-wide text-emerald-700">
                  {t.cv.skills}
                </h3>
                <p className="text-sm text-slate-700">{skillsText}</p>
              </div>
            )}

            {experienceText && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold tracking-wide text-emerald-700">
                  {t.cv.experience}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{experienceText}</p>
              </div>
            )}

            {educationText && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-bold tracking-wide text-emerald-700">
                  {t.cv.education}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{educationText}</p>
              </div>
            )}
          </div>

          {activeResume && activeResume.versions.length > 0 && (
            <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-600" />
                {t.cv.versionHistory}
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeResume.versions.map((ver) => (
                  <div key={ver.version} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                        v{ver.version}
                      </span>{' '}
                      <span className="text-slate-500">· {ver.savedAt.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSummary(ver.summary);
                        setExperienceText(ver.experienceText);
                        setSkillsText(ver.skills.join(', '));
                      }}
                      className="text-emerald-600 hover:underline font-medium"
                    >
                      Garura iyi verisiyo
                    </button>
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
