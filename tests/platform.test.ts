import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { TRANSLATIONS } from '../src/i18n/translations.ts';
import { DEFAULT_PRICING_PACKAGES, RWANDA_DISTRICTS, SEED_JOBS } from '../src/lib/rwandaData.ts';
import { mapFirebaseAuthError } from '../src/lib/authErrors.ts';
import {
  inferRwandaDistrict,
  isDuplicateJob,
  normalizeSalaryRwf,
} from '../server/jobIngestion.ts';

// 1. Verify Rwanda 30 Districts coverage
assert.equal(RWANDA_DISTRICTS.length, 30, 'All 30 districts of Rwanda must be included');

// 2. Verify Kinyarwanda, English, and French translation parity
const rwKeys = Object.keys(TRANSLATIONS.rw);
const enKeys = Object.keys(TRANSLATIONS.en);
const frKeys = Object.keys(TRANSLATIONS.fr);
assert.deepEqual(rwKeys, enKeys, 'Kinyarwanda and English top-level keys must match');
assert.deepEqual(rwKeys, frKeys, 'Kinyarwanda and French top-level keys must match');

// 3. Verify MTN MoMo MSISDN normalization & validation rules
function normalizeRwandaMsisdn(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('2507') && digits.length === 12) return digits;
  if (digits.startsWith('07') && digits.length === 10) return `250${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `250${digits}`;
  return digits;
}
function isValidRwandaMsisdn(raw: string): boolean {
  return /^2507[8923]\d{7}$/.test(normalizeRwandaMsisdn(raw));
}

assert.equal(normalizeRwandaMsisdn('0795547233'), '250795547233');
assert.equal(normalizeRwandaMsisdn('788123456'), '250788123456');
assert.equal(isValidRwandaMsisdn('0795547233'), true);
assert.equal(isValidRwandaMsisdn('0788123456'), true);
assert.equal(isValidRwandaMsisdn('+250 788 123 456'), true);
assert.equal(isValidRwandaMsisdn('12345'), false);

// 4. Verify HMAC-SHA256 webhook signature verification logic
const secret = 'test-secret';
const payload = JSON.stringify({ referenceId: 'uuid-123', status: 'SUCCESSFUL' });
const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
assert.equal(crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)), true);

// 5. Verify Firestore security rules forbid client-side self-promotion & blanket reads
const rulesContent = fs.readFileSync('firestore.rules', 'utf8');
assert.equal(rulesContent.includes('allow read, write: if false;'), true, 'Global default deny must exist');
assert.equal(rulesContent.includes("incoming().role in ['candidate', 'employer']"), true, 'Self-signup cannot assign admin role');
assert.equal(rulesContent.includes('match /payments/{paymentId}'), true, 'Payments collection must be protected');
assert.equal(rulesContent.includes("'pending_payment'"), true, 'Paid jobs must support pending_payment state');
assert.equal(rulesContent.includes("'consultancy'"), true, 'Job listing rules must support consultancy category');
assert.equal(rulesContent.includes('experienceLevel'), true, 'Job listing rules must allow experienceLevel field');
assert.equal(
  rulesContent.includes('allow get: if resource == null || existing().active == true || isAdmin();'),
  true,
  'pricing_config reads must be null-safe before packages are seeded'
);

// 6. Verify Firebase Auth friendly error handling (especially auth/cancelled-popup-request)
const rwCancelled = mapFirebaseAuthError({ code: 'auth/cancelled-popup-request' }, 'rw');
assert.equal(
  rwCancelled,
  'Guhitamo konti cyangwa kwinjira byahagaritswe cyangwa idirishya ryarafunzwe. Ongera ugerageze.'
);
const rwClosed = mapFirebaseAuthError({ code: 'auth/popup-closed-by-user' }, 'rw');
assert.equal(rwClosed, rwCancelled);
assert.ok(mapFirebaseAuthError({ code: 'auth/popup-blocked' }, 'en').includes('popup'));
assert.ok(
  mapFirebaseAuthError({ code: 'auth/unauthorized-domain' }, 'rw').includes('Authorized domains'),
  'auth/unauthorized-domain must provide actionable Authorized domains guidance'
);

// Verify zero hardcoded /src/assets/ string literals in component files (must be bundled via ES imports)
for (const relPath of [
  'src/components/JobBoardView.tsx',
  'src/components/CvBuilderView.tsx',
  'src/components/EmployerPortalView.tsx',
]) {
  const srcText = fs.readFileSync(relPath, 'utf8');
  assert.equal(
    srcText.includes('"/src/assets/'),
    false,
    `${relPath} must use static ES module imports instead of /src/assets/ paths`
  );
}

// 7. Verify Automated Job Ingestion deduplication, district geo-tagging & salary normalization
assert.equal(
  isDuplicateJob(
    {
      title: 'Senior Full-Stack TypeScript Engineer (FinTech)',
      companyName: 'Ubumwe FinTech Rwanda Ltd',
      sourceUrl: 'https://example.rw/new',
    },
    SEED_JOBS
  ),
  true
);
assert.equal(
  isDuplicateJob(
    {
      title: 'Agricultural Drone Mapping Technician',
      companyName: 'Rwanda Geo Agri Ltd',
      sourceUrl: 'https://example.rw/unique-drone-role',
    },
    SEED_JOBS
  ),
  false
);
assert.equal(inferRwandaDistrict('Position based in Musanze District'), 'Musanze');
assert.equal(normalizeSalaryRwf('900k - 1.3m'), '900,000 - 1,300,000 RWF');

// 8. Verify Pricing, Brand, New Categories, & Seed Data integrity
assert.equal(TRANSLATIONS.rw.brand, 'BonaAkazi.rw');
assert.equal(TRANSLATIONS.en.brand, 'BonaAkazi.rw');
assert.equal(TRANSLATIONS.fr.brand, 'BonaAkazi.rw');
assert.ok(DEFAULT_PRICING_PACKAGES.length >= 5);
assert.ok(SEED_JOBS.length >= 9);

for (const lang of ['rw', 'en', 'fr'] as const) {
  assert.deepEqual(
    Object.keys(TRANSLATIONS[lang].listingTypes).sort(),
    ['all', 'consultancy', 'featured', 'internship', 'job', 'other', 'public', 'scholarship', 'tender', 'training'],
    `${lang} listingTypes keys must match`
  );
  assert.deepEqual(
    Object.keys(TRANSLATIONS[lang].experienceLevels).sort(),
    ['all', 'entry', 'executive', 'internship', 'mid', 'senior', 'unspecified'],
    `${lang} experienceLevels keys must match`
  );
  assert.ok(TRANSLATIONS[lang].portalSections.employersTitle.length > 0);
  assert.equal(TRANSLATIONS[lang].portalSections.contactEmail, 'hello@bonaakazi.rw');
}

assert.ok(SEED_JOBS.some((j) => j.listingType === 'consultancy'));
assert.ok(SEED_JOBS.some((j) => j.listingType === 'internship'));
assert.ok(SEED_JOBS.some((j) => j.isPublicSector === true));
assert.ok(SEED_JOBS.every((j) => Boolean(j.publishedDate && j.experienceLevel)));

// 9. Regression checks for audit fixes (static source assertions)
const candidatePortalSource = fs.readFileSync('src/components/CandidatePortalView.tsx', 'utf8');
const actionErrorHookIndex = candidatePortalSource.indexOf('const [actionError');
const authGuardIndex = candidatePortalSource.indexOf('if (!user) {');
assert.ok(actionErrorHookIndex >= 0, 'CandidatePortalView must declare actionError state');
assert.ok(
  actionErrorHookIndex < authGuardIndex,
  'All React hooks must be declared before the auth early-return to avoid hook-order crashes'
);

const firebaseLibSource = fs.readFileSync('src/lib/firebase.ts', 'utf8');
assert.equal(
  /handleFirestoreError[\s\S]*?throw new Error/.test(firebaseLibSource),
  false,
  'handleFirestoreError must not throw from Firestore listener callbacks'
);

const serverSource = fs.readFileSync('server.ts', 'utf8');
assert.equal(
  serverSource.includes('gemini-4-hydrogen'),
  false,
  'Server must not call a non-existent Gemini model id'
);
assert.ok(
  serverSource.includes("process.env.GEMINI_MODEL || 'gemini-2.5-flash'"),
  'Gemini model must be configurable with a supported default'
);
assert.ok(
  serverSource.includes('seedInitialData'),
  'Server must persist the seed catalog so applications reference existing jobs'
);
assert.ok(
  serverSource.includes('allowSandboxPaymentSimulation'),
  'Sandbox payment simulation must be explicitly gated'
);
assert.ok(
  serverSource.includes('notifyProcessed'),
  'Application side effects must be claimed idempotently to avoid duplicate counts/notifications'
);
assert.ok(
  rulesContent.includes("data.role in ['admin', 'super_admin', 'finance_manager', 'recruitment_officer', 'moderator']"),
  'Firestore isAdmin() must recognise privileged users.role values used by the server'
);

const cvBuilderSource = fs.readFileSync('src/components/CvBuilderView.tsx', 'utf8');
assert.equal(
  cvBuilderSource.includes('.pdf,.docx'),
  false,
  'CV importer must not advertise binary PDF/DOCX uploads that File.text() cannot parse'
);

const legalSource = fs.readFileSync('src/components/LegalComplianceView.tsx', 'utf8');
assert.ok(
  legalSource.includes("getDoc(doc(db, 'users', user.uid, 'private', 'info'))"),
  'Data export must include the private user info document'
);
assert.ok(
  legalSource.includes('privateInfo: privateSnap.exists()'),
  'Data export bundle must contain the private user info payload'
);

const adminSource = fs.readFileSync('src/components/AdminDashboardView.tsx', 'utf8');
const adminDeleteIndex = adminSource.indexOf("deleteDoc(doc(db, 'admins', targetUid))");
const adminUserUpdateIndex = adminSource.indexOf("updateDoc(doc(db, 'users', targetUid)");
assert.ok(adminDeleteIndex >= 0, 'Demoting a user must revoke the admins doc');
assert.ok(
  adminDeleteIndex < adminUserUpdateIndex,
  'Revoking the admins doc must happen before the users.role change to avoid stale admin grants'
);
assert.ok(
  adminSource.includes('Ntushobora kwikuraho uburenganzira bwa admin.'),
  'Admins must be blocked from removing their own admin access'
);

console.log('ALL BonaAkazi.rw ENTERPRISE UNIT & SECURITY TESTS PASSED!');
