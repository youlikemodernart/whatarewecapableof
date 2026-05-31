import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

process.env.ASK_STORAGE_MODE = 'memory';
process.env.ASK_DEV_SESSION_SECRET = process.env.ASK_DEV_SESSION_SECRET || 'ask-smoke-session-secret-32-bytes';
process.env.ASK_ALLOWED_DOMAIN = 'whatarewecapableof.com';
process.env.ASK_ALLOWED_EMAILS = 'noah@whatarewecapableof.com';
process.env.ASK_LINK_SECRET = 'ask-smoke-link-secret-32-bytes';
process.env.ASK_MEMORY_FILE = path.join(os.tmpdir(), `wawco-ask-smoke-${process.pid}.json`);
try { fs.unlinkSync(process.env.ASK_MEMORY_FILE); } catch {}

const require = createRequire(import.meta.url);
const health = require('../api/health.js');
const session = require('../api/session.js');
const publicDeck = require('../api/public/deck.js');
const start = require('../api/public/start.js');
const submit = require('../api/public/submit.js');
const decks = require('../api/admin/decks.js');
const responses = require('../api/admin/responses.js');
const exportMarkdown = require('../api/admin/export.js');
const { createSessionCookie } = require('../api/_auth.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeReq({ method = 'GET', url = '/', cookie = '', body, headers = {} } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = {
    host: '127.0.0.1:3999',
    accept: 'application/json',
    cookie,
    ...headers,
  };
  if (body !== undefined) req.headers['content-type'] = 'application/json';
  return req;
}

async function call(handler, options) {
  const req = makeReq(options);
  let raw = '';
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(chunk = '') { raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk); },
  };
  await handler(req, res);
  const contentType = String(res.headers['content-type'] || '');
  const data = raw && contentType.includes('application/json') ? JSON.parse(raw) : raw;
  return { status: res.statusCode, headers: res.headers, data, raw };
}

function cookieHeader(setCookie) {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values.filter(Boolean).map((value) => String(value).split(';')[0]).join('; ');
}

function signedAuthFor(email) {
  const req = makeReq({});
  const cookies = createSessionCookie(req, {
    sub: `ask-smoke-${email}`,
    email,
    email_verified: true,
    name: 'Ask Smoke User',
    picture: '',
  });
  const csrfCookie = cookies.find((cookie) => String(cookie).startsWith('wawco_ask_csrf=')) || '';
  const csrf = decodeURIComponent(String(csrfCookie).split(';')[0].split('=').slice(1).join('='));
  return { cookie: cookieHeader(cookies), csrf };
}

function signedCookieFor(email) {
  return signedAuthFor(email).cookie;
}

function adminAuth() {
  return signedAuthFor('noah@whatarewecapableof.com');
}

function adminCookie() {
  return adminAuth().cookie;
}

const slug = 'sample-company-demo-7Vnyc9s3';

let result = await call(health, { url: '/api/health' });
assert(result.status === 200 && result.data.ok, 'health should pass');
assert(result.data.storage.mode === 'memory', 'smoke should use memory storage');

result = await call(publicDeck, { url: `/api/public/deck?slug=${slug}` });
assert(result.status === 200, 'public deck metadata should load');
assert(result.data.deck.passcodeRequired === true, 'seed deck should require a passcode');
assert(Array.isArray(result.data.deck.questions) && result.data.deck.questions.length === 0, 'metadata endpoint should not reveal questions before passcode');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug, passcode: 'wrong' } });
assert(result.status === 403, 'wrong passcode should fail');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug, passcode: 'sample-demo' } });
assert(result.status === 200 && result.data.draftStarted, 'correct passcode should start response');
assert(!result.data.responseId, 'start should not expose the internal response id');
assert(result.data.deck.questions.length >= 6, 'start should return questions after passcode');
const draftCookie = cookieHeader(result.headers['set-cookie']);

const answers = [
  { questionRef: 'respondent-identity', value: { name: 'Noah Smoke', email: 'noah@whatarewecapableof.com', role: 'Finance owner' } },
  { questionRef: 'company-legal-name', value: 'Sample Holdings LLC' },
  { questionRef: 'year-change-summary', value: 'No major changes.' },
  { questionRef: 'records-available-now', value: ['bookkeeping-export', 'bank-statements', 'not-sure-records'] },
  { questionRef: 'clarification-followup', value: 'yes' },
  { questionRef: 'review-path', value: 'specialist-review' },
  { questionRef: 'internal-draft-approval', value: true },
];

result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: draftCookie, body: { answers } });
assert(result.status === 200 && result.data.submitted === true, 'submit should persist response');
assert(!result.data.responseId && !result.data.response?.id, 'public submit should not expose internal response id');
assert(result.data.followupCount >= 1, 'follow-up choices should be counted');

result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: draftCookie, body: { answers } });
assert(result.status === 409, 'duplicate submit should fail');

result = await call(submit, { method: 'POST', url: '/api/public/submit', body: { answers } });
assert(result.status === 401, 'submit without draft cookie should fail');

const admin = adminAuth();
result = await call(session, { url: '/api/session', cookie: admin.cookie });
assert(result.status === 200 && result.data.user?.email === 'noah@whatarewecapableof.com', 'admin smoke session should validate');

const importDeck = {
  schemaVersion: 'ask.deck.v0',
  title: 'Imported smoke questions',
  clientLabel: 'Smoke Import Co',
  status: 'published',
  sensitivity: 'medium',
  estimatedMinutes: 2,
  sourceLabel: 'smoke fixture',
  sourceSummary: 'Sanitized deck import smoke fixture.',
  welcome: {
    title: 'Smoke import questions',
    body: 'Answer this imported test deck.',
    privacy: 'Only WAWCO can review these answers.',
  },
  questions: [
    { ref: 'import-identity', type: 'identity', section: 'About you', prompt: 'Who is answering?', required: true },
    { ref: 'import-priority', type: 'single_choice', section: 'Priority', prompt: 'What should happen next?', required: true, choices: [
      { ref: 'draft', label: 'Prepare a draft', isRecommended: true },
      { ref: 'review', label: 'Review first', requiresReview: true },
      { ref: 'not-sure', label: 'Not sure', isNotSure: true, createsFollowup: true }
    ] },
    { ref: 'import-approval', type: 'approval_checkbox', section: 'Approval', prompt: 'Can WAWCO use this answer for internal planning?', approvalText: 'Yes, use this for internal planning.', required: true }
  ],
};

result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: { 'x-ask-csrf': admin.csrf }, body: importDeck });
assert(result.status === 201 && result.data.secret?.publicSlug && result.data.secret?.passcode, 'admin import should create a deck with one-time link secret');
const imported = result.data;

result = await call(decks, { url: '/api/admin/decks', cookie: admin.cookie });
assert(result.status === 200 && result.data.decks.some((deck) => deck.id === imported.deck.id && deck.publicUrl), 'admin deck list should include imported deck link');

result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, body: importDeck });
assert(result.status === 403, 'admin import should require CSRF');

result = await call(decks, { method: 'POST', url: '/api/admin/decks', body: importDeck });
assert(result.status === 401, 'admin import should require auth');

result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: { 'x-ask-csrf': admin.csrf }, body: { ...importDeck, title: 'No passcode import', passcodeRequired: false } });
assert(result.status === 400, 'admin import should reject passcode-less decks');

result = await call(publicDeck, { url: `/api/public/deck?slug=${imported.secret.publicSlug}` });
assert(result.status === 200 && result.data.deck.questions.length === 0, 'imported deck metadata should hide questions before passcode');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: imported.secret.publicSlug, passcode: imported.secret.passcode } });
assert(result.status === 200 && result.data.deck.title === 'Imported smoke questions', 'imported deck should start with generated passcode');
const importedDraftCookie = cookieHeader(result.headers['set-cookie']);
const importedAnswers = [
  { questionRef: 'import-identity', value: { name: 'Imported Smoke', email: 'noah@whatarewecapableof.com', role: 'Reviewer' } },
  { questionRef: 'import-priority', value: 'not-sure' },
  { questionRef: 'import-approval', value: true },
];
result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: importedDraftCookie, body: { answers: importedAnswers } });
assert(result.status === 200 && result.data.followupCount >= 1, 'imported deck response should submit and count follow-up');

result = await call(responses, { url: '/api/admin/responses', cookie: admin.cookie });
assert(result.status === 200 && result.data.responses.length >= 1, 'admin response list should include submitted response');
const responseId = result.data.responses[0].id;

result = await call(exportMarkdown, { url: `/api/admin/export?id=${encodeURIComponent(responseId)}`, cookie: admin.cookie });
assert(result.status === 200 && result.raw.includes('Needs follow-up') && result.raw.includes('Boundary'), 'markdown export should include review sections');

const noCookie = await call(responses, { url: '/api/admin/responses' });
assert(noCookie.status === 401, 'admin endpoint should require auth');

const deniedCookie = await call(responses, { url: '/api/admin/responses', cookie: signedCookieFor('someone@whatarewecapableof.com') });
assert(deniedCookie.status === 401, 'admin endpoint should enforce explicit email allowlist');

console.log(JSON.stringify({
  ok: true,
  responseId,
  fingerprint: crypto.createHash('sha256').update(responseId).digest('hex').slice(0, 12),
  checks: ['health', 'metadata-hides-questions', 'passcode', 'opaque-draft-cookie', 'duplicate-submit-blocked', 'admin-auth', 'admin-allowlist', 'deck-import', 'deck-list', 'import-csrf', 'passcode-required-import', 'imported-deck-submit', 'markdown-export'],
}, null, 2));
