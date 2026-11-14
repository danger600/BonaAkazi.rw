import crypto from 'node:crypto';
import { JOB_CATEGORIES, RWANDA_DISTRICTS, SEED_JOBS } from '../src/lib/rwandaData.ts';
import type {
  EmploymentType,
  ExperienceLevel,
  IngestionRunStats,
  JobListing,
  ListingType,
} from '../src/types.ts';

export const INGESTION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

interface RawFeedEntry {
  title: string;
  companyName: string;
  description: string;
  requirements?: string[];
  listingType?: ListingType;
  employmentType?: EmploymentType;
  experienceLevel?: ExperienceLevel;
  isPublicSector?: boolean;
  publishedDate?: string;
  salaryRaw?: string;
  locationText?: string;
  deadline?: string;
  sourceUrl: string;
}

const FEED_SOURCES = [
  'https://www.mifotra.gov.rw/feeds/vacancies.xml',
  'https://www.umucyo.gov.rw/feeds/tenders.xml',
  'https://kigalitech.rw/careers/feed.json',
  'https://rwandajobnetwork.rw/rss/opportunities.xml',
];

const CURATED_RWANDA_FEED_POOL: RawFeedEntry[] = [
  {
    title: 'Cloud Infrastructure & DevSecOps Engineer',
    companyName: 'Rwanda Digital Payments Hub',
    description:
      'Gucunga ibikorwaremezo bya cloud mu mujyi wa Kigali (Gasabo), umutekano wa API za MTN MoMo na Kubernetes clusters.',
    requirements: ['Kubernetes', 'Terraform', 'Linux', 'Cybersecurity', 'CI/CD'],
    listingType: 'job',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    salaryRaw: '2100000 - 2900000',
    locationText: 'Gasabo, Kigali',
    deadline: '2026-12-28',
    sourceUrl: 'https://kigalitech.rw/careers/cloud-devsecops-kigali',
  },
  {
    title: 'Monitoring, Evaluation & Learning (MEL) Specialist',
    companyName: 'Imbere Heza Health Alliance',
    description:
      'Gukurikirana ibipimo by\'imishinga y\'ubuzima n\'imirire myiza mu turere twa Huye, Ruhango na Muhanga.',
    requirements: ['DHIS2', 'Power BI / Stata', 'M&E Frameworks', 'Kinyarwanda & English'],
    listingType: 'job',
    employmentType: 'full_time',
    experienceLevel: 'mid',
    salaryRaw: '1150000 - 1450000',
    locationText: 'Ruhango, Muhanga',
    deadline: '2026-12-22',
    sourceUrl: 'https://rwandajobnetwork.rw/jobs/mel-specialist-ruhango',
  },
  {
    title: 'Isoko ryo Gukora no Gushyira ku Murongo Sisitemu yo Kuhira Imyaka (Solar Irrigation)',
    companyName: 'Eastern Agribusiness Development Cooperative',
    description:
      'Gutanga ibikoresho byo kuhira imyaka hifashishijwe ingufu z\'izuba mu karere ka Nyagatare na Kirehe. Ibyangombwa bya RDB na RRA birakenewe.',
    requirements: ['RDB Certificate', 'RRA Tax Clearance', 'Hydraulic Engineering', 'Solar Pumping'],
    listingType: 'tender',
    employmentType: 'contract',
    experienceLevel: 'unspecified',
    salaryRaw: '64000000',
    locationText: 'Kirehe, Nyagatare',
    deadline: '2026-12-30',
    sourceUrl: 'https://www.umucyo.gov.rw/tenders/solar-irrigation-kirehe-2026',
  },
  {
    title: 'Junior Cybersecurity & SOC Analyst (Graduate Internship)',
    companyName: 'Kigali Cyber Defense Lab',
    description:
      'Gukora isuzuma ry\'umutekano w\'amakuru no kurinda sisitemu z\'ibigo by\'imari hakurikijwe Itegeko N° 058/2021 mu karere ka Nyarugenge.',
    requirements: ['SIEM Monitoring', 'OWASP Top 10', 'Networking', 'Law N° 058/2021'],
    listingType: 'internship',
    employmentType: 'internship',
    experienceLevel: 'internship',
    salaryRaw: '350000 / month',
    locationText: 'Nyarugenge, Kigali',
    deadline: '2026-12-19',
    sourceUrl: 'https://kigalitech.rw/careers/soc-analyst-trainee-2026',
  },
  {
    title: 'RFP for HR Recruitment & Shortlisting Partner',
    companyName: 'Kigali Innovation Commons',
    description:
      'Gusaba ibigo by\'abajyanama mu gushaka abakozi gutanga igiciro cyo gukora isuzuma no gutoranya abakozi b\'ikoranabuhanga.',
    requirements: ['HR Consulting', 'ATS Screening', 'RDB License', '3+ yrs Recruitment'],
    listingType: 'consultancy',
    employmentType: 'contract',
    experienceLevel: 'senior',
    salaryRaw: '9500000',
    locationText: 'Gasabo, Kigali',
    deadline: '2026-12-27',
    sourceUrl: 'https://rwandajobnetwork.rw/consultancy/hr-shortlisting-partner',
  },
  {
    title: 'Supply Chain & Cross-Border Logistics Coordinator',
    companyName: 'Kivu Lake Trade & Cargo Ltd',
    description:
      'Gukurikirana ubwikorezi bw\'ibicuruzwa byambukiranya imipaka mu karere ka Rubavu na Rusizi hamwe no gukorana na gasutamo ya RRA.',
    requirements: ['Customs Clearance', 'Supply Chain', 'RRA Asycuda', 'Kinyarwanda & French'],
    listingType: 'job',
    employmentType: 'full_time',
    experienceLevel: 'mid',
    salaryRaw: '850000 - 1100000',
    locationText: 'Rubavu',
    deadline: '2026-12-24',
    sourceUrl: 'https://rwandajobnetwork.rw/jobs/logistics-coordinator-rubavu',
  },
  {
    title: 'District Agronomist & Irrigation Officer (Public Sector)',
    companyName: 'Northern Agricultural Extension Office',
    description:
      'Gufasha amakoperative y\'abahinzi b\'ibirayi n\'ibigori mu karere ka Rulindo na Musanze kunoza umusaruro.',
    requirements: ['Agronomy BSc', 'Extension Services', 'Soil Science', 'Kinyarwanda'],
    listingType: 'job',
    employmentType: 'full_time',
    experienceLevel: 'entry',
    isPublicSector: true,
    salaryRaw: '780000',
    locationText: 'Rulindo',
    deadline: '2026-12-26',
    sourceUrl: 'https://www.mifotra.gov.rw/vacancies/agronomist-rulindo-2026',
  },
];

export function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/, '');
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

export function computeTitleCompanySimilarity(
  aTitle: string,
  aCompany: string,
  bTitle: string,
  bCompany: string
): number {
  const normA = `${aTitle} ${aCompany}`.trim().toLowerCase();
  const normB = `${bTitle} ${bCompany}`.trim().toLowerCase();
  if (normA === normB) return 1;

  const setA = tokenize(normA);
  const setB = tokenize(normB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function isDuplicateJob(
  candidate: { title: string; companyName: string; sourceUrl?: string },
  existingJobs: { title: string; companyName: string; sourceUrl?: string }[]
): boolean {
  const candidateNormUrl = candidate.sourceUrl ? normalizeUrl(candidate.sourceUrl) : '';

  for (const existing of existingJobs) {
    if (candidateNormUrl && existing.sourceUrl) {
      if (normalizeUrl(existing.sourceUrl) === candidateNormUrl) {
        return true;
      }
    }
    const sim = computeTitleCompanySimilarity(
      candidate.title,
      candidate.companyName,
      existing.title,
      existing.companyName
    );
    if (sim >= 0.8) {
      return true;
    }
  }
  return false;
}

export function inferRwandaDistrict(text: string): string {
  const lower = text.toLowerCase();
  for (const district of RWANDA_DISTRICTS) {
    if (lower.includes(district.toLowerCase())) {
      return district;
    }
  }
  if (lower.includes('kigali')) return 'Gasabo';
  return 'Gasabo';
}

export function inferJobCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/software|developer|react|typescript|devops|cloud|cyber|soc|it\b|data/.test(lower)) {
    return JOB_CATEGORIES[0];
  }
  if (/account|finance|cpa|audit|tax|ibaruramari/.test(lower)) {
    return JOB_CATEGORIES[1];
  }
  if (/health|medical|nurse|doctor|hospital|lab|mel|ubuzima/.test(lower)) {
    return JOB_CATEGORIES[2];
  }
  if (/teacher|educat|research|fellowship|university|uburezi/.test(lower)) {
    return JOB_CATEGORIES[3];
  }
  if (/engineer|solar|construction|civil|hydraulic|ubwubatsi/.test(lower)) {
    return JOB_CATEGORIES[4];
  }
  if (/agri|farm|coffee|tea|export|irrigation|ubuhinzi/.test(lower)) {
    return JOB_CATEGORIES[5];
  }
  if (/sales|marketing|hospitality|hotel|lodge|tourism|ubukerarugendo/.test(lower)) {
    return JOB_CATEGORIES[9];
  }
  if (/legal|law|compliance|governance|amategeko/.test(lower)) {
    return JOB_CATEGORIES[7];
  }
  if (/logistics|supply|project|ngo|m&e|coordinator/.test(lower)) {
    return JOB_CATEGORIES[8];
  }
  return JOB_CATEGORIES[0];
}

export function normalizeSalaryRwf(raw?: string): string {
  if (!raw || !raw.trim()) return 'Umushahara wumvikanyweho';
  const cleaned = raw.trim();
  const matches = [...cleaned.matchAll(/(\d+(?:[.,]\d+)?)(\s*[km])?/gi)];
  if (matches.length === 0) return cleaned;

  const numbers = matches
    .map((m) => {
      const base = Number(m[1].replace(/,/g, ''));
      const suffix = (m[2] || '').trim().toLowerCase();
      if (Number.isNaN(base)) return null;
      if (suffix === 'k') return Math.round(base * 1000);
      if (suffix === 'm') return Math.round(base * 1_000_000);
      return Math.round(base);
    })
    .filter((n): n is number => n !== null && n > 0);

  if (numbers.length === 0) return cleaned;
  if (numbers.length === 1) {
    return `${numbers[0].toLocaleString('en-US')} RWF`;
  }
  const [min, max] = [Math.min(numbers[0], numbers[1]), Math.max(numbers[0], numbers[1])];
  return `${min.toLocaleString('en-US')} - ${max.toLocaleString('en-US')} RWF`;
}

function parseXmlItems(xml: string, feedUrl: string): RawFeedEntry[] {
  const items: RawFeedEntry[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const match of itemMatches) {
    const block = match[1];
    const readTag = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    const title = readTag('title');
    const link = readTag('link') || feedUrl;
    const description = readTag('description') || title;
    const companyName = readTag('author') || readTag('dc:creator') || 'Rwanda Verified Organization';
    if (title.length >= 3) {
      items.push({
        title,
        companyName,
        description,
        sourceUrl: link,
      });
    }
  }
  return items;
}

async function fetchExternalFeedSafe(url: string): Promise<RawFeedEntry[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: 'application/json, application/rss+xml, application/xml, text/xml' },
    });
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    if (contentType.includes('json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
      const json = JSON.parse(text) as { items?: RawFeedEntry[] } | RawFeedEntry[];
      const arr = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
      return arr.filter((i) => i && typeof i.title === 'string' && typeof i.sourceUrl === 'string');
    }
    return parseXmlItems(text, url);
  } catch {
    return [];
  }
}

export class JobIngestionEngine {
  private ingestedMap = new Map<string, JobListing>();
  private duplicatesSkipped = 0;
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private lastRunAdded = 0;
  private timer: NodeJS.Timeout | null = null;
  private poolCursor = 2; // Start with initial batch on boot, stream remaining across cycles

  getIngestedJobs(): JobListing[] {
    return Array.from(this.ingestedMap.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  getStats(): IngestionRunStats {
    return {
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      intervalMinutes: 15,
      totalIngested: this.ingestedMap.size,
      duplicatesSkipped: this.duplicatesSkipped,
      lastRunAdded: this.lastRunAdded,
      activeFeedSources: FEED_SOURCES,
    };
  }

  async runCycle(options?: {
    batchSize?: number;
    onJobIngested?: (job: JobListing) => Promise<void> | void;
  }): Promise<{ added: JobListing[]; stats: IngestionRunStats }> {
    const now = new Date();
    this.lastRunAt = now.toISOString();
    this.nextRunAt = new Date(now.getTime() + INGESTION_INTERVAL_MS).toISOString();

    const externalResults = await Promise.all(FEED_SOURCES.map((src) => fetchExternalFeedSafe(src)));
    const externalEntries = externalResults.flat();

    const batchLimit = options?.batchSize ?? this.poolCursor;
    const curatedBatch = CURATED_RWANDA_FEED_POOL.slice(0, batchLimit);
    if (this.poolCursor < CURATED_RWANDA_FEED_POOL.length) {
      this.poolCursor = Math.min(CURATED_RWANDA_FEED_POOL.length, this.poolCursor + 2);
    }

    const candidates: RawFeedEntry[] = [...externalEntries, ...curatedBatch];
    const existingCatalog: { title: string; companyName: string; sourceUrl?: string }[] = [
      ...SEED_JOBS,
      ...this.ingestedMap.values(),
    ];

    const added: JobListing[] = [];

    for (const raw of candidates) {
      if (
        isDuplicateJob(
          { title: raw.title, companyName: raw.companyName, sourceUrl: raw.sourceUrl },
          existingCatalog
        )
      ) {
        this.duplicatesSkipped += 1;
        continue;
      }

      const id = `ing_${crypto.createHash('sha1').update(normalizeUrl(raw.sourceUrl)).digest('hex').slice(0, 14)}`;
      const combinedText = `${raw.title} ${raw.description} ${raw.locationText || ''}`;
      const district = inferRwandaDistrict(combinedText);
      const category = inferJobCategory(combinedText);
      const salaryRange = normalizeSalaryRwf(raw.salaryRaw);
      const ts = new Date().toISOString();

      const job: JobListing = {
        id,
        companyId: `comp_${id}`,
        companyName: raw.companyName.slice(0, 160),
        ownerId: 'system_auto_sync',
        listingType: raw.listingType || (/(isoko|tender)/i.test(combinedText) ? 'tender' : 'job'),
        title: raw.title.slice(0, 180),
        category: category.slice(0, 80),
        district: district.slice(0, 64),
        employmentType: raw.employmentType || 'full_time',
        experienceLevel: raw.experienceLevel || 'unspecified',
        isPublicSector: Boolean(raw.isPublicSector || /mifotra\.gov\.rw/i.test(raw.sourceUrl)),
        publishedDate: raw.publishedDate || ts.slice(0, 10),
        salaryRange: salaryRange.slice(0, 100),
        deadline: (raw.deadline || '2026-12-30').slice(0, 32),
        description: raw.description.slice(0, 10000),
        requirements: (raw.requirements || ['Kinyarwanda & English', 'Verified Experience']).slice(0, 30),
        packageTier: 'standard',
        status: 'published',
        isFeatured: false,
        applicationsCount: 0,
        sourceUrl: raw.sourceUrl.slice(0, 512),
        autoIngested: true,
        createdAt: ts,
        updatedAt: ts,
      };

      this.ingestedMap.set(id, job);
      existingCatalog.push(job);
      added.push(job);

      if (options?.onJobIngested) {
        await options.onJobIngested(job);
      }
    }

    this.lastRunAdded = added.length;
    return { added, stats: this.getStats() };
  }

  startWorker(onJobIngested: (job: JobListing) => Promise<void> | void) {
    if (this.timer) return;
    // Run initial ingestion pass asynchronously on startup
    this.runCycle({ batchSize: 3, onJobIngested }).catch((err) => {
      console.error('Initial auto-ingestion error:', err);
    });

    this.timer = setInterval(() => {
      this.runCycle({ batchSize: CURATED_RWANDA_FEED_POOL.length, onJobIngested }).catch((err) => {
        console.error('Scheduled auto-ingestion error:', err);
      });
    }, INGESTION_INTERVAL_MS);
  }
}
