export type LanguageCode = 'rw' | 'en' | 'fr';

export type UserRole =
  | 'candidate'
  | 'employer'
  | 'admin'
  | 'super_admin'
  | 'finance_manager'
  | 'recruitment_officer'
  | 'moderator';

export type AppTab =
  | 'jobs'
  | 'candidate'
  | 'cv_builder'
  | 'ai_match'
  | 'employer'
  | 'pricing'
  | 'admin'
  | 'legal';

export interface UserAccount {
  uid: string;
  displayName: string;
  role: UserRole;
  language: LanguageCode;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone?: string;
  district?: string;
  consentAccepted: boolean;
  consentUpdatedAt: string;
}

export interface EducationItem {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startYear: string;
  endYear: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  period: string;
  highlights: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export interface CandidateProfile {
  userId: string;
  headline: string;
  summary: string;
  district: string;
  yearsExperience: number;
  availability: 'immediate' | 'two_weeks' | 'one_month' | 'not_looking';
  education: EducationItem[];
  experience: ExperienceItem[];
  skills: string[];
  certifications: CertificationItem[];
  updatedAt: string;
}

export interface ResumeVersion {
  version: number;
  savedAt: string;
  note: string;
  summary: string;
  experienceText: string;
  skills: string[];
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  language: LanguageCode;
  template: 'executive' | 'modern' | 'minimal' | 'tech' | 'creative';
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  summary: string;
  skills: string[];
  experienceText: string;
  educationText: string;
  versionCount: number;
  versions: ResumeVersion[];
  aiFeedback?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  ownerId: string;
  name: string;
  sector: string;
  district: string;
  website?: string;
  tinNumber?: string;
  description: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export type ListingType =
  | 'job'
  | 'tender'
  | 'consultancy'
  | 'internship'
  | 'scholarship'
  | 'training'
  | 'other';
export type EmploymentType = 'full_time' | 'part_time' | 'remote' | 'internship' | 'contract';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'executive' | 'internship' | 'unspecified';
export type PackageTier = 'standard' | 'featured' | 'premium' | 'tender';

export interface JobListing {
  id: string;
  companyId: string;
  companyName: string;
  ownerId: string;
  listingType: ListingType;
  title: string;
  category: string;
  district: string;
  employmentType: EmploymentType;
  experienceLevel?: ExperienceLevel;
  isPublicSector?: boolean;
  publishedDate?: string;
  salaryRange?: string;
  deadline: string;
  description: string;
  requirements: string[];
  packageTier: PackageTier;
  status: 'draft' | 'pending_payment' | 'pending_review' | 'published' | 'closed' | 'rejected';
  isFeatured: boolean;
  applicationsCount: number;
  sourceUrl?: string;
  autoIngested?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionRunStats {
  lastRunAt: string | null;
  nextRunAt: string | null;
  intervalMinutes: number;
  totalIngested: number;
  duplicatesSkipped: number;
  lastRunAdded: number;
  activeFeedSources: string[];
}

export type ApplicationStatus =
  | 'submitted'
  | 'screening'
  | 'shortlisted'
  | 'interview'
  | 'offered'
  | 'rejected'
  | 'withdrawn';

export interface JobApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  companyId: string;
  companyName: string;
  employerOwnerId: string;
  candidateId: string;
  candidateName: string;
  resumeId?: string;
  coverLetter: string;
  atsScore?: number;
  status: ApplicationStatus;
  interviewDate?: string;
  interviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedJob {
  jobId: string;
  jobTitle: string;
  companyName: string;
  savedAt: string;
}

export interface JobAlert {
  id: string;
  keywords: string;
  category: string;
  district: string;
  frequency: 'instant' | 'daily' | 'weekly';
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  referenceId: string;
  payerUid: string;
  payerMsisdn: string;
  receiverMsisdn: string;
  amountRwf: number;
  currency: 'RWF' | 'EUR';
  serviceType: string;
  targetId?: string;
  status: 'pending' | 'successful' | 'failed' | 'refunded';
  environment: 'sandbox' | 'production';
  momoFinancialTransactionId?: string;
  receiptNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingPackage {
  id: string;
  nameRw: string;
  nameEn: string;
  nameFr: string;
  audience: 'employer' | 'candidate';
  priceRwf: number;
  durationDays: number;
  descriptionRw?: string;
  descriptionEn?: string;
  descriptionFr?: string;
  active: boolean;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'vacancy' | 'application' | 'payment' | 'deadline' | 'system';
  title: string;
  message: string;
  read: boolean;
  linkTab?: AppTab;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  createdAt: string;
}

export interface FraudReport {
  id: string;
  reporterUid: string;
  targetType: 'job' | 'company' | 'user';
  targetId: string;
  reason: string;
  status: 'open' | 'investigating' | 'resolved';
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  requestType: 'consent' | 'data_export' | 'data_deletion';
  granted: boolean;
  status: 'recorded' | 'pending' | 'completed';
  createdAt: string;
}

export interface AiMatchResult {
  atsScore: number;
  matchedSkills: string[];
  missingKeywords: string[];
  skillsGapSummary: string;
  honestRecommendations: string[];
  interviewQuestions: string[];
  truthfulnessNotice: string;
}
