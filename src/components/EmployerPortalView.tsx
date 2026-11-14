import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, CheckCircle2, Columns3, Download, List, PlusCircle, Users } from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { apiFetch } from '../lib/api.ts';
import { useApp } from '../contexts/AppContext.tsx';
import { getT } from '../i18n/translations.ts';
import { JOB_CATEGORIES, RWANDA_DISTRICTS } from '../lib/rwandaData.ts';
import type {
  ApplicationStatus,
  Company,
  EmploymentType,
  ExperienceLevel,
  JobApplication,
  JobListing,
  ListingType,
  PackageTier,
} from '../types.ts';

interface EmployerPortalViewProps {
  onRequestMomoCheckout: (packageId: string, targetJobId: string) => void;
}

export function EmployerPortalView({ onRequestMomoCheckout }: EmployerPortalViewProps) {
  const { user, language, signInWithGoogle } = useApp();
  const t = getT(language);

  const [subTab, setSubTab] = useState<'company' | 'post' | 'applicants' | 'reports'>('company');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [myJobs, setMyJobs] = useState<JobListing[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Company form
  const [compName, setCompName] = useState('');
  const [compSector, setCompSector] = useState(JOB_CATEGORIES[0]);
  const [compDistrict, setCompDistrict] = useState('Gasabo');
  const [compTin, setCompTin] = useState('');
  const [compWebsite, setCompWebsite] = useState('');
  const [compDesc, setCompDesc] = useState('');

  // Job posting form
  const [jobTitle, setJobTitle] = useState('');
  const [listingType, setListingType] = useState<ListingType>('job');
  const [jobCategory, setJobCategory] = useState(JOB_CATEGORIES[0]);
  const [jobDistrict, setJobDistrict] = useState('Gasabo');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('mid');
  const [isPublicSector, setIsPublicSector] = useState(false);
  const [salaryRange, setSalaryRange] = useState('');
  const [deadline, setDeadline] = useState('2026-12-30');
  const [jobDescription, setJobDescription] = useState('');
  const [requirementsText, setRequirementsText] = useState('');
  const [packageTier, setPackageTier] = useState<PackageTier>('standard');

  // Applicant filtering, Kanban view, bulk selection, & interview modal
  const [appFilterStatus, setAppFilterStatus] = useState<'all' | ApplicationStatus>('all');
  const [appViewMode, setAppViewMode] = useState<'table' | 'kanban'>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [nextStatus, setNextStatus] = useState<ApplicationStatus>('shortlisted');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');

  useEffect(() => {
    if (!user) return;

    const unsubComp = onSnapshot(
      query(collection(db, 'companies'), where('ownerId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Company);
        setCompanies(list);
        if (list[0]) {
          setCompName(list[0].name);
          setCompSector(list[0].sector);
          setCompDistrict(list[0].district);
          setCompTin(list[0].tinNumber || '');
          setCompWebsite(list[0].website || '');
          setCompDesc(list[0].description);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'companies')
    );

    const unsubJobs = onSnapshot(
      query(collection(db, 'jobs'), where('ownerId', '==', user.uid)),
      (snap) =>
        setMyJobs(
          snap.docs
            .map((d) => d.data() as JobListing)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'jobs')
    );

    const unsubApps = onSnapshot(
      query(collection(db, 'applications'), where('employerOwnerId', '==', user.uid)),
      (snap) =>
        setApplications(
          snap.docs
            .map((d) => d.data() as JobApplication)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'applications')
    );

    return () => {
      unsubComp();
      unsubJobs();
      unsubApps();
    };
  }, [user]);

  const filteredApps = useMemo(() => {
    if (appFilterStatus === 'all') return applications;
    return applications.filter((a) => a.status === appFilterStatus);
  }, [applications, appFilterStatus]);

  if (!user) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-4 max-w-xl mx-auto">
        <Building2 className="w-10 h-10 text-emerald-600 mx-auto" />
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

  const primaryCompany = companies[0];

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.emailVerified) {
      setFeedback('Emeza imeyili ya konti yawe mbere yo kwandikisha ikigo.');
      return;
    }
    const cleanName = compName.trim().slice(0, 160);
    if (cleanName.length < 2) {
      setFeedback('Izina ry\'ikigo rigomba kugira byibura inyuguti 2.');
      return;
    }
    const cleanedTin = compTin.replace(/\D/g, '');
    if (compTin.trim() && !/^\d{9}$/.test(cleanedTin)) {
      setFeedback('Nimero ya RRA TIN / RDB igomba kuba igizwe n\'imibare 9 (urugero: 104892311).');
      return;
    }
    const now = new Date().toISOString();
    const id = primaryCompany ? primaryCompany.id : `comp_${crypto.randomUUID().replace(/-/g, '')}`;
    try {
      if (primaryCompany) {
        await updateDoc(doc(db, 'companies', id), {
          name: cleanName,
          sector: compSector.slice(0, 100),
          district: compDistrict.slice(0, 64),
          tinNumber: (cleanedTin || compTin.trim()).slice(0, 32),
          website: compWebsite.trim().slice(0, 256),
          description: compDesc.trim().slice(0, 2000),
          updatedAt: now,
        });
      } else {
        const company: Company = {
          id,
          ownerId: user.uid,
          name: cleanName,
          sector: compSector.slice(0, 100),
          district: compDistrict.slice(0, 64),
          tinNumber: (cleanedTin || compTin.trim()).slice(0, 32),
          website: compWebsite.trim().slice(0, 256),
          description: compDesc.trim().slice(0, 2000),
          verificationStatus: 'pending',
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'companies', id), company);
      }
      setFeedback('Amakuru y\'ikigo yabitswe. Icyemezo cy\'ikigo kigenzurwa n\'ubuyobozi.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `companies/${id}`);
    }
  };

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.emailVerified) {
      setFeedback('Emeza imeyili ya konti yawe mbere yo gutangaza umwanya.');
      return;
    }
    if (!primaryCompany) {
      setFeedback('Banza wandikishe ikigo cyawe mbere yo gutangaza umwanya.');
      setSubTab('company');
      return;
    }
    const cleanTitle = jobTitle.trim().slice(0, 180);
    const cleanDesc = jobDescription.trim().slice(0, 10000);
    if (cleanTitle.length < 3 || cleanDesc.length < 10) {
      setFeedback('Umutwe w\'akazi (inyuguti >= 3) n\'ibisobanuro (inyuguti >= 10) birakenewe.');
      return;
    }

    const jobId = `job_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const isPaidTier = packageTier !== 'standard';
    const newJob: JobListing = {
      id: jobId,
      companyId: primaryCompany.id,
      companyName: primaryCompany.name.slice(0, 160),
      ownerId: user.uid,
      listingType,
      title: cleanTitle,
      category: jobCategory.slice(0, 80),
      district: jobDistrict.slice(0, 64),
      employmentType,
      experienceLevel,
      isPublicSector,
      publishedDate: now.slice(0, 10),
      salaryRange: salaryRange.trim().slice(0, 100),
      deadline: deadline.slice(0, 32),
      description: cleanDesc,
      requirements: requirementsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30),
      packageTier,
      // Zero-Trust Rule: Paid packages remain pending_payment until MTN MoMo server verification succeeds!
      status: isPaidTier ? 'pending_payment' : 'published',
      isFeatured: false,
      applicationsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'jobs', jobId), newJob);
      setJobTitle('');
      setJobDescription('');
      setRequirementsText('');

      if (isPaidTier) {
        const pkgMap: Record<PackageTier, string> = {
          standard: 'employer_standard',
          featured: 'employer_featured',
          premium: 'employer_premium',
          tender: 'employer_tender',
        };
        onRequestMomoCheckout(pkgMap[packageTier], jobId);
      } else {
        await apiFetch('/api/realtime/broadcast', {
          method: 'POST',
          body: JSON.stringify({
            type: 'vacancy:published',
            payload: { jobId, title: newJob.title, companyName: newJob.companyName },
          }),
        }).catch(() => {});
        setFeedback('Itangazo ryatangajwe ku rubuga rwa BonaAkazi.rw.');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `jobs/${jobId}`);
    }
  };

  const handleUpdateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    try {
      await updateDoc(doc(db, 'applications', selectedApp.id), {
        status: nextStatus,
        interviewDate: interviewDate.trim().slice(0, 64),
        interviewNotes: interviewNotes.trim().slice(0, 1000),
        updatedAt: new Date().toISOString(),
      });
      setSelectedApp(null);
      setFeedback('Imiterere y\'umukandida yavuguruwe.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `applications/${selectedApp.id}`);
    }
  };

  const handleBulkShortlist = async () => {
    if (selectedIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      for (const id of selectedIds) {
        batch.update(doc(db, 'applications', id), {
          status: 'shortlisted',
          updatedAt: now,
        });
      }
      await batch.commit();
      setSelectedIds(new Set());
      setFeedback(`Abakandida ${selectedIds.size} bashyizwe mu cyiciro cya Shortlisted.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'applications');
    }
  };

  const downloadInterviewIcs = (app: JobApplication, dt: string) => {
    if (!dt) return;
    const start = new Date(dt);
    if (Number.isNaN(start.getTime())) {
      setFeedback('Itariki y\'ikiganiro ntabwo yanditse neza (.ICS).');
      return;
    }
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BonaAkazi.rw//Recruitment//EN',
      'BEGIN:VEVENT',
      `UID:${app.id}@bonaakazi.rw`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:Ikiganiro cy'Akazi: ${app.candidateName} - ${app.jobTitle}`,
      `DESCRIPTION:${app.companyName} (${app.interviewNotes || 'Interview'})`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-${app.candidateName.toLowerCase().replace(/\s+/g, '-')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-8 p-6 sm:p-8 flex flex-col justify-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t.employer.title}</h1>
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
            {([
              ['company', t.employer.companyTab],
              ['post', t.employer.postJobTab],
              ['applicants', `${t.employer.applicantsTab} (${applications.length})`],
              ['reports', t.employer.reportsTab],
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
        </div>
        <div className="lg:col-span-4 min-h-[150px] bg-slate-100 dark:bg-slate-800">
          <img
            src="/src/assets/images/feature_employer_office_1794614731039.jpg"
            alt="Rwandan employer interview panel"
            referrerPolicy="no-referrer"
            className="w-full h-full lg:h-full object-cover"
          />
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {subTab === 'company' && (
        <form
          onSubmit={handleSaveCompany}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          {primaryCompany && (
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {t.employer.verificationStatus}:{' '}
                <span className="text-emerald-600 font-bold uppercase">{primaryCompany.verificationStatus}</span>
              </span>
              <span className="text-xs text-slate-500 tabular-nums">ID: {primaryCompany.id}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold">{t.employer.companyName}</label>
              <input
                type="text"
                required
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">{t.employer.sector}</label>
              <select
                value={compSector}
                onChange={(e) => setCompSector(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {JOB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Akarere</label>
              <select
                value={compDistrict}
                onChange={(e) => setCompDistrict(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {RWANDA_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">{t.employer.tinNumber}</label>
                <input
                  type="text"
                  value={compTin}
                  onChange={(e) => setCompTin(e.target.value)}
                  placeholder="100000000"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">{t.employer.website}</label>
                <input
                  type="text"
                  value={compWebsite}
                  onChange={(e) => setCompWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">{t.employer.companyDesc}</label>
            <textarea
              rows={3}
              required
              value={compDesc}
              onChange={(e) => setCompDesc(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {t.employer.registerCompany}
            </button>
          </div>
        </form>
      )}

      {subTab === 'post' && (
        <form
          onSubmit={handlePostJob}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold">{t.employer.jobTitle}</label>
              <input
                type="text"
                required
                minLength={3}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">{t.employer.listingType}</label>
                <select
                  value={listingType}
                  onChange={(e) => setListingType(e.target.value as ListingType)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="job">{t.listingTypes.job}</option>
                  <option value="tender">{t.listingTypes.tender}</option>
                  <option value="consultancy">{t.listingTypes.consultancy}</option>
                  <option value="internship">{t.listingTypes.internship}</option>
                  <option value="scholarship">{t.listingTypes.scholarship}</option>
                  <option value="training">{t.listingTypes.training}</option>
                  <option value="other">{t.listingTypes.other}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Ubwoko</label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="full_time">{t.employmentTypes.full_time}</option>
                  <option value="part_time">{t.employmentTypes.part_time}</option>
                  <option value="remote">{t.employmentTypes.remote}</option>
                  <option value="internship">{t.employmentTypes.internship}</option>
                  <option value="contract">{t.employmentTypes.contract}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Icyiciro</label>
                <select
                  value={jobCategory}
                  onChange={(e) => setJobCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {JOB_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Uburambe Busabwa</label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="entry">{t.experienceLevels.entry}</option>
                  <option value="mid">{t.experienceLevels.mid}</option>
                  <option value="senior">{t.experienceLevels.senior}</option>
                  <option value="executive">{t.experienceLevels.executive}</option>
                  <option value="internship">{t.experienceLevels.internship}</option>
                  <option value="unspecified">{t.experienceLevels.unspecified}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Akarere</label>
                <select
                  value={jobDistrict}
                  onChange={(e) => setJobDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {RWANDA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">{t.employer.salaryRange}</label>
                <input
                  type="text"
                  value={salaryRange}
                  onChange={(e) => setSalaryRange(e.target.value)}
                  placeholder="900,000 RWF"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">{t.jobs.deadline}</label>
                <input
                  type="date"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Ibisobanuro birambuye</label>
            <textarea
              rows={4}
              required
              minLength={10}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold">{t.jobs.requirements} (tandukanya n'akitso)</label>
              <input
                type="text"
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                placeholder="Bachelor Degree, 3+ yrs experience, Kinyarwanda"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">{t.employer.packageTier}</label>
              <select
                value={packageTier}
                onChange={(e) => setPackageTier(e.target.value as PackageTier)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="standard">Standard Job (Ubuntu / Direct Publish)</option>
                <option value="featured">Featured Job — 65,000 RWF (MTN MoMo)</option>
                <option value="premium">Premium Shortlisting — 180,000 RWF (MTN MoMo)</option>
                <option value="tender">Tender Notice — 45,000 RWF (MTN MoMo)</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isPublicSector}
              onChange={(e) => setIsPublicSector(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600"
            />
            <span>{t.listingTypes.public} (Public / Government Institution)</span>
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              className={`px-5 py-2.5 text-sm font-semibold rounded-lg inline-flex items-center gap-2 ${
                packageTier === 'standard'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-[#FFCC00] text-[#0F172A] hover:brightness-95'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              {packageTier === 'standard' ? t.employer.publishFree : t.employer.payAndPublish}
            </button>
          </div>
        </form>
      )}

      {subTab === 'applicants' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Abasabye Akazi ({filteredApps.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkShortlist}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
                >
                  Shortlist ({selectedIds.size})
                </button>
              )}
              <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAppViewMode('table')}
                  className={`px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${
                    appViewMode === 'table' ? 'bg-slate-900 text-white dark:bg-emerald-600' : ''
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Table
                </button>
                <button
                  type="button"
                  onClick={() => setAppViewMode('kanban')}
                  className={`px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${
                    appViewMode === 'kanban' ? 'bg-slate-900 text-white dark:bg-emerald-600' : ''
                  }`}
                >
                  <Columns3 className="w-3.5 h-3.5" /> Kanban
                </button>
              </div>
              <select
                value={appFilterStatus}
                onChange={(e) => setAppFilterStatus(e.target.value as 'all' | ApplicationStatus)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="all">Byose</option>
                <option value="submitted">Yoherejwe</option>
                <option value="screening">Iri Gusuzumwa</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="interview">Ikizamini / Interview</option>
                <option value="offered">Offered</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {filteredApps.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">Nta mukandida urasaba imyanya yawe.</p>
          ) : appViewMode === 'kanban' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {(['submitted', 'screening', 'shortlisted', 'interview', 'offered'] as ApplicationStatus[]).map((stage) => {
                const stageApps = applications.filter((a) => a.status === stage);
                return (
                  <div
                    key={stage}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 pb-1 border-b border-slate-200 dark:border-slate-800">
                      <span>{t.candidate.statusLabels[stage]}</span>
                      <span className="tabular-nums">{stageApps.length}</span>
                    </div>
                    <div className="space-y-2">
                      {stageApps.map((app) => (
                        <div
                          key={app.id}
                          onClick={() => {
                            setSelectedApp(app);
                            setNextStatus(app.status);
                            setInterviewDate(app.interviewDate || '');
                            setInterviewNotes(app.interviewNotes || '');
                          }}
                          className="cursor-pointer p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 space-y-1"
                        >
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{app.candidateName}</p>
                          <p className="text-[11px] text-slate-500 line-clamp-1">{app.jobTitle}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <tr>
                    <th className="py-3 pr-2 w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={filteredApps.length > 0 && selectedIds.size === filteredApps.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(filteredApps.map((a) => a.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="py-3 pr-4">Umukandida</th>
                    <th className="py-3 pr-4">Umwanya</th>
                    <th className="py-3 pr-4">Imiterere</th>
                    <th className="py-3 text-right">Igikorwa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredApps.map((app) => (
                    <tr key={app.id}>
                      <td className="py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(app.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(app.id);
                            else next.delete(app.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{app.candidateName}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{app.coverLetter}</p>
                      </td>
                      <td className="py-3 pr-4 text-xs">{app.jobTitle}</td>
                      <td className="py-3 pr-4 text-xs font-medium">{t.candidate.statusLabels[app.status]}</td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-3">
                          {app.interviewDate && (
                            <button
                              type="button"
                              onClick={() => downloadInterviewIcs(app, app.interviewDate!)}
                              className="text-xs text-slate-600 dark:text-slate-300 hover:underline inline-flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" /> .ICS
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedApp(app);
                              setNextStatus(app.status);
                              setInterviewDate(app.interviewDate || '');
                              setInterviewNotes(app.interviewNotes || '');
                            }}
                            className="text-xs font-semibold text-emerald-600 hover:underline inline-flex items-center gap-1"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            {t.employer.scheduleInterview}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'reports' && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Imyanya Natangaje</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{myJobs.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Abasabye Bose</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{applications.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Abatoranyijwe (Shortlisted)</p>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums mt-1">
              {applications.filter((a) => a.status === 'shortlisted' || a.status === 'interview').length}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500">Abahawe Akazi (Offered)</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
              {applications.filter((a) => a.status === 'offered').length}
            </p>
          </div>
        </div>
      )}

      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateApplication}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedApp.candidateName}</h3>
            <p className="text-xs text-slate-500">{selectedApp.jobTitle}</p>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Icyiciro mu Ishaka ry'Abakozi</label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as ApplicationStatus)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="submitted">Yoherejwe</option>
                <option value="screening">Gusuzumwa</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="interview">Ikiganiro (Interview)</option>
                <option value="offered">Offered</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">{t.employer.interviewDate}</label>
              <input
                type="datetime-local"
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">{t.employer.notes}</label>
              <textarea
                rows={3}
                value={interviewNotes}
                onChange={(e) => setInterviewNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedApp(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700"
              >
                {t.jobs.cancel}
              </button>
              <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white">
                {t.employer.updateStatus}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
