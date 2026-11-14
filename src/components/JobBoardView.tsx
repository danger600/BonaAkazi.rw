import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Briefcase,
  BellPlus,
  Building2,
  CheckCircle2,
  Flag,
  Mail,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { apiFetch, checkBackendHealth, isBackendServerExpected, resolveApiUrl } from '../lib/api.ts';
import { useApp } from '../contexts/AppContext.tsx';
import heroKigaliImg from '../assets/images/hero_kigali_workspace_1794614730417.jpg';
import { getT } from '../i18n/translations.ts';
import { JOB_CATEGORIES, RWANDA_DISTRICTS, SEED_COMPANIES, SEED_JOBS } from '../lib/rwandaData.ts';
import type {
  Company,
  ExperienceLevel,
  IngestionRunStats,
  JobListing,
  Resume,
  SavedJob,
} from '../types.ts';

type BoardTabFilter =
  | 'all'
  | 'featured'
  | 'job'
  | 'tender'
  | 'consultancy'
  | 'internship'
  | 'public'
  | 'other';

export function JobBoardView() {
  const { user, userAccount, language, setActiveTab, signInWithGoogle, wsConnected, liveBanner } = useApp();
  const t = getT(language);

  const [firestoreJobs, setFirestoreJobs] = useState<JobListing[]>([]);
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [firestoreCompanies, setFirestoreCompanies] = useState<Company[]>([]);
  const [ingestedJobs, setIngestedJobs] = useState<JobListing[]>([]);
  const [ingestionStats, setIngestionStats] = useState<IngestionRunStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [resumes, setResumes] = useState<Resume[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<BoardTabFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [selectedEmployment, setSelectedEmployment] = useState('all');
  const [selectedExperience, setSelectedExperience] = useState<'all' | ExperienceLevel>('all');

  // Modals & Interactive Forms
  const [activeJob, setActiveJob] = useState<JobListing | null>(null);
  const [applyModalJob, setApplyModalJob] = useState<JobListing | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [submittingApp, setSubmittingApp] = useState(false);

  const [fraudJob, setFraudJob] = useState<JobListing | null>(null);
  const [fraudReason, setFraudReason] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Job alert form
  const [alertKeywords, setAlertKeywords] = useState('');
  const [alertDistrict, setAlertDistrict] = useState('Gasabo');

  // Newsletter form
  const [newsletterName, setNewsletterName] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterMsg, setNewsletterMsg] = useState<string | null>(null);
  const [newsletterErr, setNewsletterErr] = useState<string | null>(null);
  const [newsletterLoading, setNewsletterLoading] = useState(false);

  // Public real-time listener on published jobs + verified employers + Auto-Sync ingested jobs feed
  useEffect(() => {
    const q = query(collection(db, 'jobs'), where('status', '==', 'published'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setFirestoreJobs(snap.docs.map((d) => d.data() as JobListing));
        setFirestoreReady(true);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setFirestoreReady(true);
        setErrorMsg(err.message);
        handleFirestoreError(err, OperationType.LIST, 'jobs');
      }
    );

    const compQ = query(collection(db, 'companies'), where('verificationStatus', '==', 'verified'));
    const unsubComp = onSnapshot(
      compQ,
      (snap) => {
        if (!snap.empty) {
          setFirestoreCompanies(snap.docs.map((d) => d.data() as Company));
        }
      },
      () => {
        // Fallback smoothly to SEED_COMPANIES if unavailable
      }
    );

    return () => {
      unsub();
      unsubComp();
    };
  }, []);

  useEffect(() => {
    let active = true;
    checkBackendHealth()
      .then((health) => {
        if (!active || !health.ok) return null;
        return fetch(resolveApiUrl('/api/jobs/ingested')).then((r) => (r.ok ? r.json() : null));
      })
      .then((data: { jobs?: JobListing[]; stats?: IngestionRunStats } | null) => {
        if (!active || !data) return;
        if (Array.isArray(data.jobs)) setIngestedJobs(data.jobs);
        if (data.stats) setIngestionStats(data.stats);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [liveBanner?.timestamp]);

  // When the Firestore catalog is empty, ask the backend to persist the fixed
  // public seed catalog. Without persisted jobs the applications rule rejects
  // every application to a locally-rendered SEED_JOBS entry.
  useEffect(() => {
    if (!firestoreReady || firestoreJobs.length > 0) return;
    let active = true;
    checkBackendHealth()
      .then((health) => {
        if (!active || !health.ok) return;
        return fetch(resolveApiUrl('/api/bootstrap'), { method: 'POST' });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [firestoreReady, firestoreJobs.length]);

  const jobs = useMemo(() => {
    const base = firestoreJobs.length > 0 ? firestoreJobs : SEED_JOBS;
    const map = new Map<string, JobListing>();
    for (const j of base) map.set(j.id, j);
    for (const ing of ingestedJobs) {
      if (!map.has(ing.id)) map.set(ing.id, ing);
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [firestoreJobs, ingestedJobs]);

  const verifiedEmployers = useMemo(() => {
    const map = new Map<string, Company>();
    for (const c of SEED_COMPANIES) map.set(c.id, c);
    for (const c of firestoreCompanies) map.set(c.id, c);
    return Array.from(map.values());
  }, [firestoreCompanies]);

  // User-specific saved jobs, applications, and resumes
  useEffect(() => {
    if (!user) {
      setSavedIds(new Set());
      setAppliedJobIds(new Set());
      setResumes([]);
      return;
    }

    const unsubSaved = onSnapshot(
      collection(db, 'users', user.uid, 'saved_jobs'),
      (snap) => {
        setSavedIds(new Set(snap.docs.map((d) => d.id)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/saved_jobs`)
    );

    const unsubApps = onSnapshot(
      query(collection(db, 'applications'), where('candidateId', '==', user.uid)),
      (snap) => {
        setAppliedJobIds(new Set(snap.docs.map((d) => (d.data() as { jobId: string }).jobId)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'applications')
    );

    const unsubResumes = onSnapshot(
      query(collection(db, 'resumes'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Resume);
        setResumes(list);
        if (list.length > 0 && !selectedResumeId) {
          setSelectedResumeId(list[0].id);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'resumes')
    );

    return () => {
      unsubSaved();
      unsubApps();
      unsubResumes();
    };
  }, [user]);

  const tabCounts = useMemo<Record<BoardTabFilter, number>>(() => {
    return {
      all: jobs.length,
      featured: jobs.filter((j) => j.isFeatured).length,
      job: jobs.filter((j) => j.listingType === 'job').length,
      tender: jobs.filter((j) => j.listingType === 'tender').length,
      consultancy: jobs.filter((j) => j.listingType === 'consultancy').length,
      internship: jobs.filter((j) => j.listingType === 'internship' || j.employmentType === 'internship').length,
      public: jobs.filter((j) => Boolean(j.isPublicSector)).length,
      other: jobs.filter(
        (j) =>
          j.listingType === 'other' ||
          j.listingType === 'scholarship' ||
          j.listingType === 'training'
      ).length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return jobs.filter((job) => {
      if (selectedType === 'featured' && !job.isFeatured) return false;
      else if (selectedType === 'public' && !job.isPublicSector) return false;
      else if (selectedType === 'internship' && job.listingType !== 'internship' && job.employmentType !== 'internship') return false;
      else if (
        selectedType === 'other' &&
        job.listingType !== 'other' &&
        job.listingType !== 'scholarship' &&
        job.listingType !== 'training'
      ) {
        return false;
      } else if (
        (selectedType === 'job' || selectedType === 'tender' || selectedType === 'consultancy') &&
        job.listingType !== selectedType
      ) {
        return false;
      }

      if (selectedCategory !== 'all' && job.category !== selectedCategory) return false;
      if (selectedDistrict !== 'all' && job.district !== selectedDistrict) return false;
      if (selectedEmployment !== 'all' && job.employmentType !== selectedEmployment) return false;
      if (selectedExperience !== 'all' && (job.experienceLevel || 'unspecified') !== selectedExperience) {
        return false;
      }
      if (term) {
        const hay = `${job.title} ${job.companyName} ${job.category} ${job.district} ${job.description} ${job.requirements.join(' ')}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [jobs, searchTerm, selectedType, selectedCategory, selectedDistrict, selectedEmployment, selectedExperience]);

  const featuredJobs = useMemo(() => jobs.filter((j) => j.isFeatured).slice(0, 3), [jobs]);

  const handleToggleSave = async (job: JobListing) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!user.emailVerified) {
      setFeedbackBanner('Emeza imeyili ya konti yawe mbere yo kubika akazi.');
      return;
    }
    const ref = doc(db, 'users', user.uid, 'saved_jobs', job.id);
    try {
      if (savedIds.has(job.id)) {
        await deleteDoc(ref);
      } else {
        const payload: SavedJob = {
          jobId: job.id,
          jobTitle: job.title.slice(0, 180) || 'Umwanya',
          companyName: job.companyName.slice(0, 160) || 'Ikigo',
          savedAt: new Date().toISOString(),
        };
        await setDoc(ref, payload);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/saved_jobs/${job.id}`);
    }
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !applyModalJob) return;
    if (!user.emailVerified) {
      setFeedbackBanner('Emeza imeyili ya konti yawe mbere yo kohereza dosiye.');
      return;
    }
    setSubmittingApp(true);
    try {
      const appId = `app_${crypto.randomUUID().replace(/-/g, '')}`;
      const now = new Date().toISOString();
      await setDoc(doc(db, 'applications', appId), {
        id: appId,
        jobId: applyModalJob.id,
        jobTitle: applyModalJob.title.slice(0, 180),
        companyId: applyModalJob.companyId,
        companyName: applyModalJob.companyName.slice(0, 160),
        employerOwnerId: applyModalJob.ownerId,
        candidateId: user.uid,
        candidateName: (userAccount?.displayName || user.displayName || 'Umukandida').slice(0, 120),
        resumeId: selectedResumeId.slice(0, 128),
        coverLetter: (coverLetter.trim() || 'Ndifuza gusaba uyu mwanya w\'akazi.').slice(0, 6000),
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });

      if (isBackendServerExpected()) {
        // Server-side side effects: increments applicationsCount and notifies
        // the employer. Both are blocked for regular users by Firestore rules.
        await apiFetch('/api/applications/notify', {
          method: 'POST',
          body: JSON.stringify({ applicationId: appId }),
        }).catch(() => {});
      }

      setApplyModalJob(null);
      setCoverLetter('');
      setFeedbackBanner(`Dosiye yawe kuri "${applyModalJob.title}" yoherejwe neza.`);
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error
          ? `Ntibyakunze kohereza dosiye: ${err.message}`
          : 'Ntibyakunze kohereza dosiye. Ongera ugerageze.'
      );
      handleFirestoreError(err, OperationType.CREATE, 'applications');
    } finally {
      setSubmittingApp(false);
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithGoogle();
      return;
    }
    if (!user.emailVerified) {
      setFeedbackBanner('Emeza imeyili ya konti yawe mbere yo kubika imenyesha.');
      return;
    }
    const alertId = `alert_${crypto.randomUUID().replace(/-/g, '')}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'alerts', alertId), {
        id: alertId,
        keywords: (alertKeywords.trim() || 'All').slice(0, 120),
        category: (selectedCategory === 'all' ? 'All' : selectedCategory).slice(0, 80),
        district: alertDistrict.slice(0, 64),
        frequency: 'instant',
        createdAt: new Date().toISOString(),
      });
      setAlertKeywords('');
      setFeedbackBanner('Imenyesha ry\'akazi (Job Alert) ryabitswe.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/alerts/${alertId}`);
    }
  };

  const handleSubmitFraud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !fraudJob || fraudReason.trim().length < 5) return;
    if (!user.emailVerified) {
      setFeedbackBanner('Emeza imeyili ya konti yawe mbere yo kohereza ikirego.');
      return;
    }
    const reportId = `rep_${crypto.randomUUID().replace(/-/g, '')}`;
    try {
      await setDoc(doc(db, 'fraud_reports', reportId), {
        id: reportId,
        reporterUid: user.uid,
        targetType: 'job',
        targetId: fraudJob.id.slice(0, 128),
        reason: fraudReason.trim().slice(0, 1000),
        status: 'open',
        createdAt: new Date().toISOString(),
      });
      setFraudJob(null);
      setFraudReason('');
      setFeedbackBanner('Ikirego cy\'uburiganya cyakiriwe n\'ubuyobozi.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `fraud_reports/${reportId}`);
    }
  };

  const handleSubscribeNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterErr(null);
    setNewsletterMsg(null);

    const cleanEmail = newsletterEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setNewsletterErr('Shyiramo imeyili yemewe (urugero: izina@domain.rw).');
      return;
    }

    setNewsletterLoading(true);
    try {
      const health = await checkBackendHealth();
      if (health.ok) {
        const res = await fetch(resolveApiUrl('/api/newsletter/subscribe'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newsletterName.trim(), email: cleanEmail }),
        });
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
        if (!res.ok) {
          throw new Error(data.error || 'Ntibyakunze kwiyandikisha.');
        }
      } else {
        // Persist locally when deployed purely as a static frontend
        const key = 'bonaakazi_newsletter_subs';
        const existing = JSON.parse(localStorage.getItem(key) || '[]') as string[];
        if (!existing.includes(cleanEmail)) {
          localStorage.setItem(key, JSON.stringify([...existing, cleanEmail].slice(0, 50)));
        }
      }
      setNewsletterMsg(t.portalSections.newsletterSuccess);
      setNewsletterName('');
      setNewsletterEmail('');
    } catch (err) {
      setNewsletterErr(err instanceof Error ? err.message : 'Subscription error');
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Hero Split Section */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-8 lg:p-12 flex flex-col justify-center space-y-6">
            <p className="text-xs font-medium tracking-wide text-emerald-700 dark:text-emerald-400">
              {t.hero.eyebrow}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[2.6rem] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15] [text-wrap:balance]">
              {t.hero.title}
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              {t.hero.subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#vacancies-board"
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0"
              >
                {t.hero.primaryCta}
              </a>
              <button
                type="button"
                onClick={() => setActiveTab('employer')}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {t.hero.secondaryCta}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[260px] lg:min-h-full bg-slate-900">
            <img
              src={heroKigaliImg}
              alt="Kigali modern technology and recruitment workspace"
              referrerPolicy="no-referrer"
              className="w-full h-full lg:h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent flex items-end p-6">
              <div className="text-white space-y-1">
                <p className="text-xs font-medium text-emerald-300">Kigali · Musanze · Huye · Rubavu · Rwamagana</p>
                <p className="text-sm font-semibold">Imirimo n'amasoko byagenzuwe mu turere 30 tw'u Rwanda</p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width 4-column metric bar below hero split */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-200 dark:border-slate-800 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
          <div className="p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Imyanya Iriho Ubu</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{jobs.length}</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Uturere Dushyigikiwe</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">30 / 30</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Indimi z'Urubuga</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">RW · EN · FR</p>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Kwishyura Kizewe</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">MTN MoMo API</p>
          </div>
        </div>
      </section>

      {feedbackBanner && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:underline text-xs font-medium whitespace-nowrap"
          >
            Funga
          </button>
        </div>
      )}

      {/* Featured Vacancies Section */}
      {featuredJobs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t.jobs.featuredTitle}</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {featuredJobs.length} featured
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featuredJobs.map((job) => (
              <article
                key={job.id}
                onClick={() => setActiveJob(job)}
                className="cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl p-5 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {job.companyName} · {t.listingTypes[job.listingType]}
                  </p>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {job.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {job.district} · {t.employmentTypes[job.employmentType]} · {t.jobs.deadline}:{' '}
                    <span className="tabular-nums font-medium">{job.deadline}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                    {job.salaryRange || 'Umushahara wumvikanyweho'}
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Reba →
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Search & Multi-Filter Job Board */}
      <section id="vacancies-board" className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t.hero.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="all">{t.hero.allCategories}</option>
              {JOB_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="all">{t.hero.allDistricts}</option>
              {RWANDA_DISTRICTS.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>

            <select
              value={selectedEmployment}
              onChange={(e) => setSelectedEmployment(e.target.value)}
              className="px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="all">{t.hero.allTypes}</option>
              <option value="full_time">{t.employmentTypes.full_time}</option>
              <option value="part_time">{t.employmentTypes.part_time}</option>
              <option value="remote">{t.employmentTypes.remote}</option>
              <option value="internship">{t.employmentTypes.internship}</option>
              <option value="contract">{t.employmentTypes.contract}</option>
            </select>

            <select
              value={selectedExperience}
              onChange={(e) => setSelectedExperience(e.target.value as 'all' | ExperienceLevel)}
              className="px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="all">{t.experienceLevels.all}</option>
              <option value="entry">{t.experienceLevels.entry}</option>
              <option value="mid">{t.experienceLevels.mid}</option>
              <option value="senior">{t.experienceLevels.senior}</option>
              <option value="executive">{t.experienceLevels.executive}</option>
              <option value="internship">{t.experienceLevels.internship}</option>
              <option value="unspecified">{t.experienceLevels.unspecified}</option>
            </select>
          </div>

          {/* Segmented interactive Jobs Tabs Menu with Live Counts */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'featured', 'job', 'tender', 'consultancy', 'internship', 'public', 'other'] as const).map(
                (type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                      selectedType === type
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>{t.listingTypes[type]}</span>
                    <span className="tabular-nums opacity-75">({tabCounts[type]})</span>
                  </button>
                )
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              {wsConnected && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  Biravugururwa ako kanya (Auto-Sync 15m{ingestionStats?.totalIngested ? ` · +${ingestionStats.totalIngested}` : ''})
                </span>
              )}
              <p className="tabular-nums">
                {filteredJobs.length} / {jobs.length} {t.listingTypes.all.toLowerCase()}
              </p>
            </div>
          </div>
        </div>

        {/* Job List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse p-6"
              />
            ))}
          </div>
        ) : errorMsg ? (
          <div className="p-6 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-800 dark:text-rose-200">
            {errorMsg}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <Briefcase className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-300">{t.jobs.noResults}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredJobs.map((job) => {
              const isSaved = savedIds.has(job.id);
              const isApplied = appliedJobIds.has(job.id);
              return (
                <article
                  key={job.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {job.companyName} · {t.listingTypes[job.listingType]} · {job.category}
                        </p>
                        <h3
                          onClick={() => setActiveJob(job)}
                          className="text-lg font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer leading-snug"
                        >
                          {job.title}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleSave(job)}
                        aria-label={isSaved ? t.jobs.saved : t.jobs.saveJob}
                        className={`p-2 rounded-lg border transition-colors shrink-0 ${
                          isSaved
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Bookmark className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {job.district}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{t.experienceLevels[job.experienceLevel || 'unspecified']}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {t.jobs.publishedOn}: {job.publishedDate || job.createdAt.slice(0, 10)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {t.jobs.deadline}: {job.deadline}
                      </span>
                      {job.isPublicSector && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {t.listingTypes.public}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {job.applicationsCount} {t.jobs.applicationsCount}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                      {job.salaryRange || 'RWF'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('ai_match')}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        ATS Match
                      </button>
                      <button
                        type="button"
                        disabled={isApplied}
                        onClick={() => {
                          if (!user) {
                            signInWithGoogle();
                          } else {
                            setApplyModalJob(job);
                          }
                        }}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          isApplied
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {isApplied ? t.jobs.applied : t.jobs.applyNow}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Job Alerts & Newsletter Subscription Row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <form onSubmit={handleCreateAlert} className="space-y-4">
            <label className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BellPlus className="w-4 h-4 text-emerald-600" />
              {t.jobs.createAlert}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={alertKeywords}
                onChange={(e) => setAlertKeywords(e.target.value)}
                placeholder={t.jobs.alertKeywordPlaceholder}
                className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <select
                value={alertDistrict}
                onChange={(e) => setAlertDistrict(e.target.value)}
                className="sm:w-40 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {RWANDA_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#0F172A] dark:bg-emerald-600 text-white hover:opacity-95 whitespace-nowrap"
              >
                {t.jobs.saveAlertBtn}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <form onSubmit={handleSubscribeNewsletter} className="space-y-4">
            <label className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-600" />
              {t.portalSections.newsletterTitle}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newsletterName}
                onChange={(e) => setNewsletterName(e.target.value)}
                placeholder={t.portalSections.newsletterName}
                className="sm:w-40 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <input
                type="email"
                required
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder={t.portalSections.newsletterEmail}
                className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={newsletterLoading}
                className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap disabled:opacity-50"
              >
                {newsletterLoading ? '...' : t.portalSections.newsletterBtn}
              </button>
            </div>
            {newsletterMsg && <p className="text-xs text-emerald-600 font-medium">{newsletterMsg}</p>}
            {newsletterErr && <p className="text-xs text-rose-600 font-medium">{newsletterErr}</p>}
          </form>
        </div>
      </section>

      {/* Verified Employers Directory & HR Services */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                {t.portalSections.employersTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.portalSections.employersSubtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('employer')}
              className="text-xs font-semibold text-emerald-600 hover:underline whitespace-nowrap"
            >
              {t.hero.secondaryCta} →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {verifiedEmployers.slice(0, 6).map((emp) => (
              <div
                key={emp.id}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-1"
              >
                <p className="text-sm font-bold text-slate-900 dark:text-white">{emp.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {emp.district} · {emp.sector}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t.portalSections.hrServicesTitle}
          </h2>
          <div className="space-y-3">
            {t.portalSections.hrServices.map((srv) => (
              <div
                key={srv.title}
                className="pb-3 border-b last:border-b-0 last:pb-0 border-slate-100 dark:border-slate-800"
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{srv.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{srv.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Realtime Market Insights & About / Contact Desk */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t.portalSections.insightsTitle}
          </h2>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-xs font-semibold text-emerald-600 hover:underline"
          >
            {t.portalSections.backToTop}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
            <p className="text-xs text-slate-500">{t.portalSections.publishedMetric}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{jobs.length}</p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
            <p className="text-xs text-slate-500">{t.portalSections.employersMetric}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{verifiedEmployers.length}</p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
            <p className="text-xs text-slate-500">{t.portalSections.districtsMetric}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{RWANDA_DISTRICTS.length}</p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
            <p className="text-xs text-slate-500">{t.portalSections.candidatesMetric}</p>
            <p className="text-sm font-bold text-emerald-600 mt-2">CV Builder · Gemini ATS</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.portalSections.aboutTitle}</h3>
            <p className="leading-relaxed">{t.portalSections.aboutDesc}</p>
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.portalSections.contactTitle}</h3>
            <p>{t.portalSections.contactLocation}</p>
            <p className="font-mono text-emerald-700 dark:text-emerald-400">{t.portalSections.contactEmail}</p>
          </div>
        </div>
      </section>

      {/* Job Details Drawer / Modal */}
      {activeJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {activeJob.companyName} · {activeJob.district} · {t.listingTypes[activeJob.listingType]}
                  {activeJob.isPublicSector ? ` · ${t.listingTypes.public}` : ''}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{activeJob.title}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {t.employmentTypes[activeJob.employmentType]} ·{' '}
                  {t.experienceLevels[activeJob.experienceLevel || 'unspecified']} ·{' '}
                  {t.jobs.publishedOn}: {activeJob.publishedDate || activeJob.createdAt.slice(0, 10)} ·{' '}
                  {t.jobs.deadline}: {activeJob.deadline} ·{' '}
                  {activeJob.salaryRange || 'Umushahara wumvikanyweho'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveJob(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {activeJob.description}
              {activeJob.autoIngested && activeJob.sourceUrl && (
                <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">
                  Inkomoko (Auto-Sync): <span className="font-mono break-all">{activeJob.sourceUrl}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{t.jobs.requirements}</h4>
              <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">
                {activeJob.requirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    signInWithGoogle();
                  } else {
                    setFraudJob(activeJob);
                    setActiveJob(null);
                  }
                }}
                className="text-xs font-medium text-slate-500 hover:text-rose-600 inline-flex items-center gap-1.5"
              >
                <Flag className="w-3.5 h-3.5" />
                {t.jobs.reportFraud}
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  {t.jobs.cancel}
                </button>
                <button
                  type="button"
                  disabled={appliedJobIds.has(activeJob.id)}
                  onClick={() => {
                    if (!user) {
                      signInWithGoogle();
                    } else {
                      setApplyModalJob(activeJob);
                      setActiveJob(null);
                    }
                  }}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  {appliedJobIds.has(activeJob.id) ? t.jobs.applied : t.jobs.applyNow}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Apply Modal */}
      {applyModalJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitApplication}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t.jobs.applyModalTitle}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {applyModalJob.title} · {applyModalJob.companyName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApplyModalJob(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.jobs.selectCv}</label>
              <select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="">-- Hitamo CV cyangwa ukoreshe umwirondoro --</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.language.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.jobs.coverLetter}</label>
              <textarea
                rows={5}
                required
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder="Andika ibaruwa isobanura ubunararibonye bwawe n'impamvu usaba uyu mwanya..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApplyModalJob(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700"
              >
                {t.jobs.cancel}
              </button>
              <button
                type="submit"
                disabled={submittingApp}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {submittingApp ? '...' : t.jobs.submitApplication}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fraud Report Modal */}
      {fraudJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitFraud}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t.jobs.reportFraud}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{fraudJob.title}</p>
            <textarea
              rows={4}
              required
              minLength={5}
              value={fraudReason}
              onChange={(e) => setFraudReason(e.target.value)}
              placeholder="Sobanura impamvu ukeka uburiganya (urugero: gusaba amafaranga yo kubona akazi)..."
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFraudJob(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700"
              >
                {t.jobs.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 text-white"
              >
                Ohereza Ikirego
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
