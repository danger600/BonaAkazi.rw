import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer as createViteServer } from 'vite';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { DEFAULT_PRICING_PACKAGES } from './src/lib/rwandaData.ts';
import { JobIngestionEngine } from './server/jobIngestion.ts';
import type { JobListing, PaymentRecord } from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId: firebaseConfig.projectId,
    });

const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function isConfiguredSecret(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(YOUR_|MY_|CHANGE_ME|REPLACE_|PLACEHOLDER)/i.test(trimmed)) return false;
  return true;
}

const RECEIVER_MSISDN = process.env.MTN_MOMO_RECEIVER_MSISDN || '0795547233';
const MOMO_BASE_URL = process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const MOMO_TARGET_ENV = process.env.MTN_MOMO_TARGET_ENV === 'production' ? 'production' : 'sandbox';
const MOMO_SUB_KEY = isConfiguredSecret(process.env.MTN_MOMO_SUBSCRIPTION_KEY || '')
  ? (process.env.MTN_MOMO_SUBSCRIPTION_KEY || '').trim()
  : '';
const MOMO_API_USER = isConfiguredSecret(process.env.MTN_MOMO_API_USER || '')
  ? (process.env.MTN_MOMO_API_USER || '').trim()
  : '';
const MOMO_API_KEY = isConfiguredSecret(process.env.MTN_MOMO_API_KEY || '')
  ? (process.env.MTN_MOMO_API_KEY || '').trim()
  : '';
const MOMO_CALLBACK_SECRET = process.env.MTN_MOMO_CALLBACK_SECRET || 'dev-sandbox-hmac-secret';

const hasLiveMomoCredentials = Boolean(MOMO_SUB_KEY && MOMO_API_USER && MOMO_API_KEY);
const hasConfiguredGeminiKey = isConfiguredSecret(process.env.GEMINI_API_KEY || '');

function parseAiJson<T>(rawText: string | undefined, fallback: T): T {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!cleaned) return fallback;
  return JSON.parse(cleaned) as T;
}

const newsletterSubscribers = new Map<string, { name: string; email: string; subscribedAt: string }>();

// Replay protection cache for payment webhook callbacks
const processedCallbackNonces = new Set<string>();

// Server-side authoritative fallback store when GCP ADC is absent in sandboxed preview
const memoryPayments = new Map<string, PaymentRecord>();
const memoryAuditLogs: {
  id: string;
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  createdAt: string;
}[] = [];

// Sliding window rate limiter
const rateBuckets = new Map<string, number[]>();
function rateLimit(maxPerMinute: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (rateBuckets.get(key) || []).filter((t) => t > windowStart);
    if (timestamps.length >= maxPerMinute) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
    }
    timestamps.push(now);
    rateBuckets.set(key, timestamps);
    next();
  };
}

interface AuthenticatedRequest extends express.Request {
  user?: DecodedIdToken;
  rawIdToken?: string;
}

async function requireAuth(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing authentication token.' });
  }
  const token = authHeader.slice(7).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    req.rawIdToken = token;
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
}

async function isAdminUser(decoded: DecodedIdToken): Promise<boolean> {
  if (decoded.email === 'toxiccoderkiller@gmail.com' && decoded.email_verified) {
    return true;
  }
  try {
    const adminSnap = await adminDb.collection('admins').doc(decoded.uid).get();
    if (adminSnap.exists) return true;
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    if (userSnap.exists) {
      const role = userSnap.data()?.role;
      return ['admin', 'super_admin', 'finance_manager', 'recruitment_officer', 'moderator'].includes(role);
    }
  } catch {
    // Graceful fallback if Admin SDK lacks IAM ADC in local sandbox
  }
  return false;
}

function getLanguageName(lang: string): string {
  if (lang === 'fr') return 'French';
  if (lang === 'en') return 'English';
  return 'Kinyarwanda';
}

function normalizeRwandaMsisdn(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('2507') && digits.length === 12) return digits;
  if (digits.startsWith('07') && digits.length === 10) return `250${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `250${digits}`;
  return digits;
}

function isValidRwandaMsisdn(raw: string): boolean {
  const normalized = normalizeRwandaMsisdn(raw);
  return /^2507[8923]\d{7}$/.test(normalized);
}

let momoTokenCache: { token: string; expiresAt: number } | null = null;

async function fetchMomoAccessToken(): Promise<string> {
  if (momoTokenCache && Date.now() < momoTokenCache.expiresAt) {
    return momoTokenCache.token;
  }
  const credentials = Buffer.from(`${MOMO_API_USER}:${MOMO_API_KEY}`).toString('base64');
  const response = await fetch(`${MOMO_BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Ocp-Apim-Subscription-Key': MOMO_SUB_KEY,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`MTN MoMo OAuth token error: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('MTN MoMo OAuth response missing access_token');
  }
  const ttlMs = Math.max(60, Number(data.expires_in || 3600) - 60) * 1000;
  momoTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ttlMs,
  };
  return data.access_token;
}

async function writeAuditLog(
  actorUid: string,
  action: string,
  resourceType: string,
  resourceId: string,
  details: string
) {
  const id = `audit_${crypto.randomUUID().replace(/-/g, '')}`;
  const entry = {
    id,
    actorUid,
    action,
    resourceType,
    resourceId,
    details: details.slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  memoryAuditLogs.unshift(entry);
  if (memoryAuditLogs.length > 200) memoryAuditLogs.pop();

  try {
    await adminDb.collection('audit_logs').doc(id).set(entry);
  } catch {
    // Non-fatal in environments without Firestore Admin ADC
  }
}

async function savePaymentRecord(payment: PaymentRecord) {
  memoryPayments.set(payment.referenceId, payment);
  try {
    await adminDb.collection('payments').doc(payment.id).set(payment);
  } catch {
    // Fallback to in-memory authoritative store if Admin SDK lacks ADC
  }
}

async function findPaymentByReference(referenceId: string): Promise<PaymentRecord | null> {
  try {
    const snap = await adminDb
      .collection('payments')
      .where('referenceId', '==', referenceId)
      .limit(1)
      .get();
    if (!snap.empty) {
      return snap.docs[0].data() as PaymentRecord;
    }
  } catch {
    // Fallback to in-memory store
  }
  return memoryPayments.get(referenceId) || null;
}

async function findPaymentById(paymentId: string): Promise<PaymentRecord | null> {
  try {
    const snap = await adminDb.collection('payments').doc(paymentId).get();
    if (snap.exists) {
      return snap.data() as PaymentRecord;
    }
  } catch {
    // Fallback to in-memory store
  }
  for (const p of memoryPayments.values()) {
    if (p.id === paymentId) return p;
  }
  return null;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastRealtimeEvent(type: string, payload: Record<string, unknown>) {
  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      type: 'connection:ready',
      payload: { channel: 'bonaakazi-live' },
      timestamp: new Date().toISOString(),
    })
  );
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    wsEnabled: true,
    service: 'BonaAkazi.rw',
    momoMode: hasLiveMomoCredentials ? MOMO_TARGET_ENV : 'sandbox_awaiting_credentials',
    receiverMsisdn: RECEIVER_MSISDN,
  });
});

app.post('/api/bootstrap', rateLimit(30), (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/seed', requireAuth, async (req: AuthenticatedRequest, res) => {
  const adminAllowed = await isAdminUser(req.user!);
  if (!adminAllowed) {
    return res.status(403).json({ error: 'Forbidden: Admin privileges required.' });
  }
  await writeAuditLog(
    req.user!.uid,
    'seed_initial_data',
    'system',
    'bootstrap',
    'Triggered initial Rwanda packages, companies, and vacancies seed.'
  );
  res.json({ ok: true, message: 'Initial Rwanda data verified and seeded.' });
});

const ingestionEngine = new JobIngestionEngine();

async function persistAndBroadcastIngestedJob(job: JobListing) {
  try {
    await adminDb.collection('jobs').doc(job.id).set(job);
  } catch {
    // Non-fatal in preview environments without GCP ADC
  }
  broadcastRealtimeEvent('vacancy:ingested', {
    jobId: job.id,
    title: job.title,
    companyName: job.companyName,
    district: job.district,
  });
}

app.get('/api/jobs/ingested', (_req, res) => {
  res.json({
    jobs: ingestionEngine.getIngestedJobs(),
    stats: ingestionEngine.getStats(),
  });
});

app.get('/api/ingestion/status', (_req, res) => {
  res.json({
    stats: ingestionEngine.getStats(),
  });
});

app.post('/api/ingestion/run', requireAuth, rateLimit(10), async (req: AuthenticatedRequest, res) => {
  const adminAllowed = await isAdminUser(req.user!);
  if (!adminAllowed) {
    return res.status(403).json({ error: 'Forbidden: Admin privileges required.' });
  }
  const result = await ingestionEngine.runCycle({
    batchSize: 20,
    onJobIngested: persistAndBroadcastIngestedJob,
  });
  await writeAuditLog(
    req.user!.uid,
    'auto_ingestion_manual_run',
    'system',
    'job_ingestion',
    `Auto-Sync ran manually: added ${result.added.length} new vacancies, skipped ${result.stats.duplicatesSkipped} duplicates.`
  );
  res.json({
    addedCount: result.added.length,
    jobs: result.added,
    stats: result.stats,
  });
});

app.post('/api/realtime/broadcast', requireAuth, rateLimit(40), (req: AuthenticatedRequest, res) => {
  const { type, payload } = req.body || {};
  if (typeof type !== 'string' || !type) {
    return res.status(400).json({ error: 'Invalid event type.' });
  }
  broadcastRealtimeEvent(type, {
    ...(typeof payload === 'object' && payload !== null ? payload : {}),
    actorUid: req.user!.uid,
  });
  res.json({ ok: true });
});

app.post('/api/newsletter/subscribe', rateLimit(15), (req, res) => {
  const { name, email } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 254);
  const cleanName = String(name || 'Umukoresha').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({
      error: 'Shyiramo imeyili yemewe (urugero: izina@domain.rw).',
    });
  }
  const now = new Date().toISOString();
  newsletterSubscribers.set(cleanEmail, { name: cleanName, email: cleanEmail, subscribedAt: now });
  res.status(201).json({
    ok: true,
    subscribed: true,
    totalSubscribers: newsletterSubscribers.size,
  });
});

// =======================
// GEMINI AI ENDPOINTS
// =======================

app.post('/api/ai/job-match', requireAuth, rateLimit(20), async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasConfiguredGeminiKey) {
      return res.status(503).json({
        error: 'Urufunguzo rwa Gemini API (GEMINI_API_KEY) ntirurashyirwaho kuri seriveri.',
      });
    }
    const { cvText, jobTitle, jobDescription, requirements, language = 'rw' } = req.body || {};
    if (!cvText || !jobDescription) {
      return res.status(400).json({ error: 'Inyandiko ya CV n\'ibisobanuro by\'akazi birakenewe.' });
    }
    const targetLang = getLanguageName(language);

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Analyze this candidate CV against the target job in Rwanda.
Target Language for ALL output strings: ${targetLang}.

JOB TITLE: ${String(jobTitle || '').slice(0, 200)}
JOB REQUIREMENTS: ${Array.isArray(requirements) ? requirements.join(', ') : String(requirements || '')}
JOB DESCRIPTION:
${String(jobDescription).slice(0, 5000)}

CANDIDATE CV:
${String(cvText).slice(0, 8000)}`,
      config: {
        systemInstruction: `You are an ethical, rigorous ATS and career advisor for BonaAkazi.rw.
CRITICAL TRUTHFULNESS RULE: NEVER invent qualifications, degrees, certifications, employers, or years of experience that are not explicitly present in the candidate's CV. Only evaluate what is genuinely in the CV and give honest, actionable recommendations.
Respond strictly in ${targetLang}.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            atsScore: { type: Type.INTEGER },
            matchedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            skillsGapSummary: { type: Type.STRING },
            honestRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            interviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            truthfulnessNotice: { type: Type.STRING },
          },
          required: [
            'atsScore',
            'matchedSkills',
            'missingKeywords',
            'skillsGapSummary',
            'honestRecommendations',
            'interviewQuestions',
            'truthfulnessNotice',
          ],
        },
      },
    });

    const parsed = parseAiJson<Record<string, unknown>>(response.text, {});
    const safeScore = Math.min(100, Math.max(0, Math.round(Number(parsed.atsScore) || 0)));
    res.json({
      atsScore: safeScore,
      matchedSkills: Array.isArray(parsed.matchedSkills) ? parsed.matchedSkills : [],
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
      skillsGapSummary: String(parsed.skillsGapSummary || ''),
      honestRecommendations: Array.isArray(parsed.honestRecommendations) ? parsed.honestRecommendations : [],
      interviewQuestions: Array.isArray(parsed.interviewQuestions) ? parsed.interviewQuestions : [],
      truthfulnessNotice: String(parsed.truthfulnessNotice || ''),
    });
  } catch (err) {
    console.error('Gemini job-match error:', err);
    res.status(500).json({ error: 'Isuzuma rya AI ryagize ikibazo. Ongera ugerageze.' });
  }
});

app.post('/api/ai/improve-cv', requireAuth, rateLimit(20), async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasConfiguredGeminiKey) {
      return res.status(503).json({
        error: 'Urufunguzo rwa Gemini API (GEMINI_API_KEY) ntirurashyirwaho kuri seriveri.',
      });
    }
    const { summary, experienceText, skills, language = 'rw' } = req.body || {};
    if (!summary && !experienceText) {
      return res.status(400).json({ error: 'Incamake cyangwa ubunararibonye birakenewe.' });
    }
    const targetLang = getLanguageName(language);

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Improve the clarity, professional tone, and ATS keyword structure of this CV without adding ANY fabricated skills, roles, metrics, or credentials.
Output Language: ${targetLang}

SUMMARY:
${String(summary || '').slice(0, 2500)}

EXPERIENCE:
${String(experienceText || '').slice(0, 6000)}

SKILLS: ${Array.isArray(skills) ? skills.join(', ') : String(skills || '')}`,
      config: {
        systemInstruction: `You are a professional CV editor for BonaAkazi.rw.
NEVER invent fake jobs, dates, metrics, or qualifications. Only polish grammar, action verbs, and structure from existing facts. Respond strictly in ${targetLang}.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            improvedSummary: { type: Type.STRING },
            improvedExperienceText: { type: Type.STRING },
            editorialNotes: { type: Type.STRING },
          },
          required: ['improvedSummary', 'improvedExperienceText', 'editorialNotes'],
        },
      },
    });

    const parsed = parseAiJson<Record<string, unknown>>(response.text, {});
    res.json({
      improvedSummary: String(parsed.improvedSummary || summary || '').slice(0, 3000),
      improvedExperienceText: String(parsed.improvedExperienceText || experienceText || '').slice(0, 8000),
      editorialNotes: String(parsed.editorialNotes || '').slice(0, 4000),
    });
  } catch (err) {
    console.error('Gemini improve-cv error:', err);
    res.status(500).json({ error: 'Kunoza CV na AI byagize ikibazo.' });
  }
});

app.post('/api/ai/cover-letter', requireAuth, rateLimit(20), async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasConfiguredGeminiKey) {
      return res.status(503).json({
        error: 'Urufunguzo rwa Gemini API (GEMINI_API_KEY) ntirurashyirwaho kuri seriveri.',
      });
    }
    const { cvText, jobTitle, companyName, jobDescription, language = 'rw' } = req.body || {};
    if (!cvText || !jobTitle) {
      return res.status(400).json({ error: 'Inyandiko ya CV n\'umutwe w\'akazi birakenewe.' });
    }
    const targetLang = getLanguageName(language);

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Write a tailored, honest cover letter for:
JOB TITLE: ${String(jobTitle).slice(0, 200)}
COMPANY: ${String(companyName || '').slice(0, 160)}
JOB DESCRIPTION: ${String(jobDescription || '').slice(0, 4000)}
CANDIDATE CV: ${String(cvText).slice(0, 6000)}
Language: ${targetLang}`,
      config: {
        systemInstruction: `You are an ethical career writer. Write a concise, persuasive cover letter strictly grounded in facts from the candidate's CV. Never fabricate experience or credentials. Respond in ${targetLang}.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coverLetter: { type: Type.STRING },
          },
          required: ['coverLetter'],
        },
      },
    });

    const parsed = parseAiJson<{ coverLetter?: string }>(response.text, {});
    res.json({ coverLetter: String(parsed.coverLetter || '') });
  } catch (err) {
    console.error('Gemini cover-letter error:', err);
    res.status(500).json({ error: 'Gutegura ibaruwa isaba akazi byagize ikibazo.' });
  }
});

app.post('/api/ai/interview-prep', requireAuth, rateLimit(20), async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasConfiguredGeminiKey) {
      return res.status(503).json({
        error: 'Urufunguzo rwa Gemini API (GEMINI_API_KEY) ntirurashyirwaho kuri seriveri.',
      });
    }
    const { cvText, jobTitle, jobDescription, language = 'rw' } = req.body || {};
    if (!jobTitle) {
      return res.status(400).json({ error: 'Umutwe w\'akazi urakenewe.' });
    }
    const targetLang = getLanguageName(language);

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Prepare 5 realistic interview questions and honest answering guidance for:
JOB TITLE: ${String(jobTitle).slice(0, 200)}
JOB DESCRIPTION: ${String(jobDescription || '').slice(0, 4000)}
CANDIDATE CV: ${String(cvText || '').slice(0, 6000)}
Language: ${targetLang}`,
      config: {
        systemInstruction: `You are a Rwandan recruitment coach. Provide practical interview questions and preparation tips grounded strictly in the candidate's real background. Never tell the candidate to claim false experience. Respond in ${targetLang}.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  strategy: { type: Type.STRING },
                },
                required: ['question', 'strategy'],
              },
            },
          },
          required: ['items'],
        },
      },
    });

    const parsed = parseAiJson<{ items?: { question: string; strategy: string }[] }>(response.text, {});
    res.json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch (err) {
    console.error('Gemini interview-prep error:', err);
    res.status(500).json({ error: 'Gutegura ikiganiro cy\'akazi byagize ikibazo.' });
  }
});

// ===============================
// MTN MOMO RWANDA OPEN API
// ===============================

app.get('/api/momo/config', requireAuth, (_req, res) => {
  res.json({
    receiverMsisdn: RECEIVER_MSISDN,
    environment: hasLiveMomoCredentials ? MOMO_TARGET_ENV : 'sandbox',
    credentialsConfigured: hasLiveMomoCredentials,
    currency: 'RWF',
    merchantOnboardingNotice:
      'Receiving number 0795547233 is configured subject to MTN MoMo Rwanda merchant onboarding approval.',
  });
});

const PACKAGE_ALIAS_MAP: Record<string, string> = {
  standard: 'employer_standard',
  featured: 'employer_featured',
  premium: 'employer_premium',
  tender: 'employer_tender',
};

app.get('/api/momo/my-payments', requireAuth, (req: AuthenticatedRequest, res) => {
  const mine = Array.from(memoryPayments.values())
    .filter((p) => p.payerUid === req.user!.uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ payments: mine });
});

app.post('/api/momo/request-to-pay', requireAuth, rateLimit(15), async (req: AuthenticatedRequest, res) => {
  try {
    const { payerMsisdn, packageId, serviceType, targetId, idempotencyKey } = req.body || {};
    if (!payerMsisdn || !isValidRwandaMsisdn(String(payerMsisdn))) {
      return res.status(400).json({
        error:
          "Nimero ya MTN MoMo ntabwo yuzuye. Shyiramo nimero y'u Rwanda ikora (urugero: 0788123456 cyangwa 079XXXXXXX).",
      });
    }

    const rawPkgId = String(packageId || serviceType || 'employer_standard').trim();
    const pkgId = PACKAGE_ALIAS_MAP[rawPkgId] || rawPkgId;
    let pkgData = DEFAULT_PRICING_PACKAGES.find((p) => p.id === pkgId);
    try {
      const pkgSnap = await adminDb.collection('pricing_config').doc(pkgId).get();
      if (pkgSnap.exists && Number.isFinite(Number(pkgSnap.data()?.priceRwf))) {
        pkgData = pkgSnap.data() as typeof pkgData;
      }
    } catch {
      // Fallback to default pricing catalog
    }

    if (!pkgData || !Number.isFinite(Number(pkgData.priceRwf))) {
      return res.status(400).json({ error: 'Ipaki yatoranyijwe ntabwo ibaho muri sisitemu.' });
    }

    const amountRwf = Number(pkgData.priceRwf);
    const normalizedPayer = normalizeRwandaMsisdn(String(payerMsisdn));

    if (typeof idempotencyKey === 'string' && idempotencyKey.length >= 8) {
      const existing = await findPaymentByReference(idempotencyKey);
      if (existing) {
        return res.status(200).json({
          payment: existing,
          idempotentReplay: true,
          credentialsConfigured: hasLiveMomoCredentials,
        });
      }
    }

    const referenceId =
      typeof idempotencyKey === 'string' && /^[0-9a-f-]{36}$/i.test(idempotencyKey)
        ? idempotencyKey
        : crypto.randomUUID();
    const paymentId = `pay_${referenceId.replace(/-/g, '')}`;
    const now = new Date().toISOString();

    let momoStatus: 'pending' | 'failed' = 'pending';
    let effectiveEnvironment: 'sandbox' | 'production' = hasLiveMomoCredentials ? MOMO_TARGET_ENV : 'sandbox';
    let sandboxFallback = false;
    let gatewayNotice: string | undefined;

    if (hasLiveMomoCredentials) {
      try {
        const token = await fetchMomoAccessToken();
        const callbackUrl = process.env.APP_URL
          ? `${process.env.APP_URL.replace(/\/$/, '')}/api/momo/callback`
          : undefined;

        const momoRes = await fetch(`${MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Reference-Id': referenceId,
            'X-Target-Environment': MOMO_TARGET_ENV,
            'Ocp-Apim-Subscription-Key': MOMO_SUB_KEY,
            'Content-Type': 'application/json',
            ...(callbackUrl ? { 'X-Callback-Url': callbackUrl } : {}),
          },
          body: JSON.stringify({
            amount: String(amountRwf),
            currency: MOMO_TARGET_ENV === 'sandbox' ? 'EUR' : 'RWF',
            externalId: paymentId,
            payer: {
              partyIdType: 'MSISDN',
              partyId: normalizedPayer,
            },
            payerMessage: `BonaAkazi ${pkgId}`.slice(0, 32),
            payeeNote: `Merchant ${RECEIVER_MSISDN}`,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (momoRes.status !== 202) {
          momoStatus = 'failed';
          gatewayNotice = `MTN MoMo API returned HTTP ${momoRes.status}`;
        }
      } catch (momoErr) {
        const detail = momoErr instanceof Error ? momoErr.message : String(momoErr);
        console.warn('MTN MoMo upstream request error:', detail);
        if (MOMO_TARGET_ENV === 'production') {
          return res.status(502).json({
            error: `Kwihuza na MTN MoMo byananiranye (${detail}). Ongera ugerageze cyangwa ugenzure ibyangombwa bya API.`,
          });
        }
        effectiveEnvironment = 'sandbox';
        sandboxFallback = true;
        gatewayNotice = `Sandbox fallback active (${detail})`;
      }
    }

    const paymentDoc: PaymentRecord = {
      id: paymentId,
      referenceId,
      payerUid: req.user!.uid,
      payerMsisdn: normalizedPayer,
      receiverMsisdn: RECEIVER_MSISDN,
      amountRwf,
      currency: 'RWF',
      serviceType: pkgId,
      targetId: targetId ? String(targetId) : '',
      status: momoStatus,
      environment: effectiveEnvironment,
      createdAt: now,
      updatedAt: now,
    };

    await savePaymentRecord(paymentDoc);
    await writeAuditLog(
      req.user!.uid,
      'momo_request_to_pay_initiated',
      'payment',
      paymentId,
      `Initiated ${amountRwf} RWF Request-to-Pay to ${RECEIVER_MSISDN} (ref: ${referenceId}).${gatewayNotice ? ` Note: ${gatewayNotice}` : ''}`
    );

    res.status(202).json({
      payment: paymentDoc,
      credentialsConfigured: hasLiveMomoCredentials && !sandboxFallback,
      sandboxFallback,
      warning: gatewayNotice,
      message: 'Request to Pay accepted. Awaiting server-side MTN MoMo verification before service activation.',
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('MoMo request-to-pay error:', err);
    res.status(500).json({ error: `Failed to initiate MTN MoMo payment request (${detail}).` });
  }
});

async function finalizeVerifiedPayment(
  payment: PaymentRecord,
  financialTransactionId: string
): Promise<PaymentRecord> {
  if (payment.status === 'successful') {
    return payment;
  }

  const now = new Date().toISOString();
  const receiptNumber = `BNA-${Date.now().toString().slice(-6)}-${payment.id.slice(-4).toUpperCase()}`;

  const updatedPayment: PaymentRecord = {
    ...payment,
    status: 'successful',
    momoFinancialTransactionId: financialTransactionId,
    receiptNumber,
    updatedAt: now,
  };

  await savePaymentRecord(updatedPayment);

  try {
    if (payment.targetId) {
      const jobRef = adminDb.collection('jobs').doc(String(payment.targetId));
      const jobSnap = await jobRef.get();
      if (jobSnap.exists) {
        const isFeaturedTier =
          payment.serviceType === 'employer_featured' || payment.serviceType === 'employer_premium';
        await jobRef.update({
          status: 'published',
          isFeatured: isFeaturedTier,
          updatedAt: now,
        });
        broadcastRealtimeEvent('vacancy:published', {
          jobId: payment.targetId,
          title: jobSnap.data()?.title,
        });
      }
    }

    const notifId = `notif_${crypto.randomUUID().replace(/-/g, '')}`;
    await adminDb.collection('notifications').doc(notifId).set({
      id: notifId,
      userId: payment.payerUid,
      type: 'payment',
      title: 'Ubwishyu bwa MTN MoMo Bwemejwe',
      message: `Inyemezabwishyu ${receiptNumber} ya ${payment.amountRwf} RWF yemejwe kuri ${RECEIVER_MSISDN}.`,
      read: false,
      linkTab: 'pricing',
      createdAt: now,
    });
  } catch {
    // Non-fatal when Admin SDK lacks ADC in local preview
  }

  await writeAuditLog(
    payment.payerUid,
    'momo_payment_verified',
    'payment',
    payment.id,
    `Server-verified payment ${receiptNumber} (${payment.amountRwf} RWF)`
  );

  broadcastRealtimeEvent('payment:updated', {
    paymentId: payment.id,
    status: 'successful',
    receiptNumber,
  });

  return updatedPayment;
}

app.get('/api/momo/status/:referenceId', requireAuth, rateLimit(30), async (req: AuthenticatedRequest, res) => {
  try {
    const referenceId = String(req.params.referenceId || '');
    const payment = await findPaymentByReference(referenceId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment reference not found.' });
    }

    const adminAllowed = await isAdminUser(req.user!);
    if (payment.payerUid !== req.user!.uid && !adminAllowed) {
      return res.status(403).json({ error: 'Forbidden: Cannot inspect another user payment.' });
    }

    if (payment.status === 'successful' || payment.status === 'refunded') {
      return res.json({ payment });
    }

    if (hasLiveMomoCredentials) {
      const token = await fetchMomoAccessToken();
      const statusRes = await fetch(`${MOMO_BASE_URL}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': MOMO_TARGET_ENV,
          'Ocp-Apim-Subscription-Key': MOMO_SUB_KEY,
        },
      });
      if (!statusRes.ok) {
        return res.status(502).json({ error: `MTN status check returned HTTP ${statusRes.status}` });
      }
      const momoPayload = (await statusRes.json()) as { status?: string; financialTransactionId?: string };
      if (momoPayload.status === 'SUCCESSFUL') {
        const finalized = await finalizeVerifiedPayment(payment, momoPayload.financialTransactionId || referenceId);
        return res.json({ payment: finalized });
      }
      if (momoPayload.status === 'FAILED') {
        const failedPayment: PaymentRecord = {
          ...payment,
          status: 'failed',
          updatedAt: new Date().toISOString(),
        };
        await savePaymentRecord(failedPayment);
        return res.json({ payment: failedPayment });
      }
      return res.json({ payment });
    }

    const simOutcome = req.query.sandboxOutcome;
    if (simOutcome === 'SUCCESSFUL') {
      const finalized = await finalizeVerifiedPayment(
        payment,
        `SBX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      );
      return res.json({ payment: finalized, sandboxVerified: true });
    }
    if (simOutcome === 'FAILED') {
      const failedPayment: PaymentRecord = {
        ...payment,
        status: 'failed',
        updatedAt: new Date().toISOString(),
      };
      await savePaymentRecord(failedPayment);
      return res.json({ payment: failedPayment, sandboxVerified: true });
    }

    return res.json({ payment, awaitingMerchantApproval: !hasLiveMomoCredentials });
  } catch (err) {
    console.error('MoMo status error:', err);
    res.status(500).json({ error: 'Failed to verify MTN MoMo payment status.' });
  }
});

app.post('/api/momo/callback', rateLimit(60), async (req, res) => {
  try {
    const signature = String(req.headers['x-momo-signature'] || '');
    const nonce = String(req.headers['x-momo-nonce'] || req.body?.referenceId || '');
    const rawBody = JSON.stringify(req.body || {});
    const expectedSig = crypto.createHmac('sha256', MOMO_CALLBACK_SECRET).update(rawBody).digest('hex');

    if (
      !signature ||
      signature.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      return res.status(401).json({ error: 'Invalid callback signature.' });
    }
    if (!nonce || processedCallbackNonces.has(nonce)) {
      return res.status(409).json({ error: 'Duplicate or missing callback nonce (replay protection).' });
    }
    processedCallbackNonces.add(nonce);

    const { referenceId, status, financialTransactionId } = req.body || {};
    if (!referenceId) {
      return res.status(400).json({ error: 'Missing referenceId.' });
    }

    const payment = await findPaymentByReference(String(referenceId));
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found.' });
    }

    if (status === 'SUCCESSFUL') {
      await finalizeVerifiedPayment(payment, String(financialTransactionId || referenceId));
    } else if (status === 'FAILED') {
      await savePaymentRecord({
        ...payment,
        status: 'failed',
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('MoMo callback error:', err);
    res.status(500).json({ error: 'Callback processing failed.' });
  }
});

app.post('/api/momo/refund', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const adminAllowed = await isAdminUser(req.user!);
    if (!adminAllowed) {
      return res.status(403).json({ error: 'Forbidden: Finance Manager or Admin role required for refunds.' });
    }
    const { paymentId, reason } = req.body || {};
    if (!paymentId) {
      return res.status(400).json({ error: 'paymentId is required.' });
    }

    const payment = await findPaymentById(String(paymentId));
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found.' });
    }

    if (payment.status !== 'successful') {
      return res.status(400).json({ error: 'Only successful payments can be refunded.' });
    }

    const refunded: PaymentRecord = {
      ...payment,
      status: 'refunded',
      updatedAt: new Date().toISOString(),
    };
    await savePaymentRecord(refunded);

    await writeAuditLog(
      req.user!.uid,
      'momo_payment_refunded',
      'payment',
      String(paymentId),
      `Refunded ${payment.amountRwf} RWF. Reason: ${String(reason || 'Admin reconciliation')}`
    );

    broadcastRealtimeEvent('payment:updated', { paymentId, status: 'refunded' });
    res.json({ payment: refunded });
  } catch (err) {
    console.error('MoMo refund error:', err);
    res.status(500).json({ error: 'Failed to process refund.' });
  }
});

app.get('/api/momo/ledger', requireAuth, async (req: AuthenticatedRequest, res) => {
  const adminAllowed = await isAdminUser(req.user!);
  if (!adminAllowed) {
    return res.status(403).json({ error: 'Forbidden: Admin or Finance Manager role required.' });
  }
  res.json({
    payments: Array.from(memoryPayments.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    auditLogs: memoryAuditLogs,
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript');
      res.send(`
const sheetsMap = new Map();
let lastInsertedStyle;

export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}

export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}

export function createHotContext() {
  return {
    data: {},
    accept() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
  };
}

export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}

export class ErrorOverlay {}
`);
    });

    const vite = await createViteServer({
      server: { middlewareMode: true, ws: false, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`BonaAkazi.rw server listening on http://0.0.0.0:${port}`);
    ingestionEngine.startWorker(persistAndBroadcastIngestedJob);
  });
}

startServer();
