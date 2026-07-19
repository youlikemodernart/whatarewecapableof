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

const seedSlug = 'sample-company-demo-7Vnyc9s3';
const admin = adminAuth();
const adminHeaders = { 'x-ask-csrf': admin.csrf };

let result = await call(health, { url: '/api/health' });
assert(result.status === 200 && result.data.ok, 'health should pass');
assert(result.data.storage.mode === 'memory', 'smoke should use memory storage');

result = await call(publicDeck, { url: `/api/public/deck?slug=${seedSlug}` });
assert(result.status === 200, 'public deck metadata should load');
assert(result.data.deck.passcodeRequired === true, 'seed deck should require a passcode');
assert(Array.isArray(result.data.deck.questions) && result.data.deck.questions.length === 0, 'metadata endpoint should not reveal questions before passcode');
assert(result.data.deck.title === 'Private questions', 'passcode metadata should hide the title');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: seedSlug, passcode: 'sample-demo' } });
assert(result.status === 400, 'start should require an explicit Begin action');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: seedSlug, passcode: 'wrong', begin: true } });
assert(result.status === 403, 'wrong passcode should fail');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: seedSlug, passcode: 'sample-demo', begin: true } });
assert(result.status === 200 && result.data.draftStarted && result.data.resumed === false, 'correct passcode should start response');
assert(!result.data.responseId, 'start should not expose the internal response id');
assert(result.data.deck.questions.length >= 6, 'start should return questions after passcode');
const draftCookie = cookieHeader(result.headers['set-cookie']);

result = await call(start, { method: 'POST', url: '/api/public/start', cookie: draftCookie, body: { slug: seedSlug, passcode: 'sample-demo', begin: true } });
assert(result.status === 200 && result.data.resumed === true, 'repeated Begin should resume the existing draft');
assert(!result.headers['set-cookie'], 'resumed drafts should not overwrite the signed draft cookie');

result = await call(start, { method: 'POST', url: '/api/public/start', cookie: `${draftCookie}tampered`, body: { slug: seedSlug, passcode: 'sample-demo', begin: true } });
assert(result.status === 200 && result.data.resumed === false && result.headers['set-cookie'], 'tampered draft cookies should not resume an existing response');

const answers = [
  { questionRef: 'respondent-identity', value: { name: 'Noah Smoke', email: 'noah@whatarewecapableof.com', role: 'Finance owner' } },
  { questionRef: 'company-legal-name', value: 'Sample Holdings LLC' },
  { questionRef: 'year-change-summary', value: 'No major changes.' },
  { questionRef: 'records-available-now', value: ['bookkeeping-export', 'bank-statements', 'not-sure-records'] },
  { questionRef: 'clarification-followup', value: 'yes' },
  { questionRef: 'review-path', value: 'specialist-review' },
  { questionRef: 'internal-draft-approval', value: true },
];

const incompleteLegacyAnswers = answers.map((answer) => answer.questionRef === 'respondent-identity'
  ? { ...answer, value: { name: 'Noah Smoke', email: 'noah@whatarewecapableof.com' } }
  : answer);
result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: draftCookie, body: { answers: incompleteLegacyAnswers } });
assert(result.status === 400, 'legacy required identity should still require role when field flags are absent');

result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: draftCookie, body: { answers } });
assert(result.status === 200 && result.data.submitted === true, 'submit should persist response');
assert(!result.data.responseId && !result.data.response?.id, 'public submit should not expose internal response id');
assert(result.data.followupCount >= 1, 'follow-up choices should be counted');

result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: draftCookie, body: { answers } });
assert(result.status === 409, 'duplicate submit should fail');

result = await call(submit, { method: 'POST', url: '/api/public/submit', body: { answers } });
assert(result.status === 401, 'submit without draft cookie should fail');

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
      { ref: 'not-sure', label: 'Not sure', isNotSure: true, createsFollowup: true },
    ] },
    { ref: 'import-approval', type: 'approval_checkbox', section: 'Approval', prompt: 'Can WAWCO use this answer for internal planning?', approvalText: 'Yes, use this for internal planning.', required: true },
  ],
};

result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: importDeck });
assert(result.status === 201 && result.data.secret?.publicSlug && result.data.secret?.passcode, 'admin import should create a default private deck');
assert(result.data.deck.accessMode === 'passcode' && result.data.deck.passcodeRequired === true, 'imports should remain passcode-protected by default');
const imported = result.data;

const malformedDeckInput = { ...importDeck, title: 'Malformed passcode smoke questions', clientLabel: 'Malformed Passcode Co' };
result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: malformedDeckInput });
assert(result.status === 201 && result.data.secret?.passcode, 'malformed-passcode fixture should begin as a normal private deck');
const malformedDeck = result.data;
const persistedState = JSON.parse(fs.readFileSync(process.env.ASK_MEMORY_FILE, 'utf8'));
const malformedRecord = persistedState.decks.find((deck) => deck.deckId === malformedDeck.deck.id);
assert(malformedRecord, 'malformed-passcode fixture should exist in isolated memory storage');
malformedRecord.passcodeHash = '';
fs.writeFileSync(process.env.ASK_MEMORY_FILE, JSON.stringify(persistedState, null, 2));
result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: malformedDeck.secret.publicSlug, passcode: malformedDeck.secret.passcode, begin: true } });
assert(result.status === 403, 'passcode-required decks with missing credential material should fail closed');

result = await call(decks, { url: '/api/admin/decks', cookie: admin.cookie });
assert(result.status === 200 && result.data.decks.some((deck) => deck.id === imported.deck.id && deck.publicUrl && deck.accessMode === 'passcode'), 'admin deck list should include the imported private link');

result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, body: importDeck });
assert(result.status === 403, 'admin import should require CSRF');

result = await call(decks, { method: 'POST', url: '/api/admin/decks', body: importDeck });
assert(result.status === 401, 'admin import should require auth');

result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { ...importDeck, title: 'No passcode import', passcodeRequired: false } });
assert(result.status === 400, 'admin import should reject passcode-less decks');

result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { ...importDeck, title: 'Link-only import', access: { mode: 'link-only', publicSlug: 'smoke-link-only', publicExposureAcknowledged: true } } });
assert(result.status === 400, 'link-only access should be an admin-only reconfiguration');

result = await call(publicDeck, { url: `/api/public/deck?slug=${imported.secret.publicSlug}` });
assert(result.status === 200 && result.data.deck.questions.length === 0 && result.data.deck.title === 'Private questions', 'imported deck metadata should hide private details before passcode');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: imported.secret.publicSlug, passcode: imported.secret.passcode, begin: true } });
assert(result.status === 200 && result.data.deck.title === 'Imported smoke questions', 'imported deck should start with generated passcode');
const importedDraftCookie = cookieHeader(result.headers['set-cookie']);
const importedAnswers = [
  { questionRef: 'import-identity', value: { name: 'Imported Smoke', email: 'noah@whatarewecapableof.com', role: 'Reviewer' } },
  { questionRef: 'import-priority', value: 'not-sure' },
  { questionRef: 'import-approval', value: true },
];
result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: importedDraftCookie, body: { answers: importedAnswers } });
assert(result.status === 200 && result.data.followupCount >= 1, 'imported deck response should submit and count follow-up');

const changeDeckInput = { ...importDeck, title: 'Access-change smoke questions', clientLabel: 'Access Change Co' };
result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: changeDeckInput });
assert(result.status === 201 && result.data.deck.passcodeRequired, 'access-change fixture should begin as a private deck');
const changeDeck = result.data;

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', body: { id: changeDeck.deck.id, access: { mode: 'link-only', publicSlug: 'smoke-link-only', publicExposureAcknowledged: true } } });
assert(result.status === 401, 'access reconfiguration should require auth');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, body: { id: changeDeck.deck.id, access: { mode: 'link-only', publicSlug: 'smoke-link-only', publicExposureAcknowledged: true } } });
assert(result.status === 403, 'access reconfiguration should require CSRF');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { id: changeDeck.deck.id, access: { mode: 'link-only', publicSlug: 'Bad_slug', publicExposureAcknowledged: true } } });
assert(result.status === 400, 'link-only reconfiguration should validate human-readable slugs');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { id: 'ask_deck_nope', access: { mode: 'link-only', publicSlug: 'missing-deck-link', publicExposureAcknowledged: true } } });
assert(result.status === 404, 'access reconfiguration should reject missing decks');

const highDeckInput = { ...importDeck, title: 'High-sensitivity smoke questions', sensitivity: 'high' };
result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: highDeckInput });
assert(result.status === 201, 'high-sensitivity fixture should import with the safe default');
const highDeck = result.data;
result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { id: highDeck.deck.id, access: { mode: 'link-only', publicSlug: 'high-sensitivity-link', publicExposureAcknowledged: true } } });
assert(result.status === 400, 'high-sensitivity decks should reject link-only access');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { id: changeDeck.deck.id, access: { mode: 'link-only', publicSlug: 'smoke-link-only', publicExposureAcknowledged: false } } });
assert(result.status === 400, 'link-only reconfiguration should require explicit public exposure acknowledgement');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { id: changeDeck.deck.id, access: { mode: 'link-only', publicSlug: 'smoke-link-only', publicExposureAcknowledged: true } } });
assert(result.status === 200 && result.data.deck.accessMode === 'link-only' && result.data.deck.passcodeRequired === false, 'zero-response deck should become link-only');
assert(result.data.secret?.publicSlug === 'smoke-link-only' && !result.data.secret?.passcode && result.data.secret?.passcodeRequired === false, 'link-only reconfiguration should return no passcode');
const linkOnly = result.data;
const eventState = JSON.parse(fs.readFileSync(process.env.ASK_MEMORY_FILE, 'utf8'));
const accessEvent = eventState.events.find((event) => event.deckId === changeDeck.deck.id && event.eventType === 'access_reconfigured');
assert(accessEvent?.metadata?.fromAccessMode === 'passcode' && accessEvent.metadata?.toAccessMode === 'link-only', 'access reconfiguration should record only safe mode-change metadata');
assert(!Object.hasOwn(accessEvent.metadata, 'publicSlug') && !Object.hasOwn(accessEvent.metadata, 'passcode'), 'access events should not retain raw links or passcodes');

result = await call(publicDeck, { url: `/api/public/deck?slug=${changeDeck.secret.publicSlug}` });
assert(result.status === 404, 'old private slug should stop resolving after reconfiguration');

result = await call(publicDeck, { url: '/api/public/deck?slug=smoke-link-only' });
assert(result.status === 200 && result.data.deck.passcodeRequired === false, 'link-only metadata should load without a passcode');
assert(result.data.deck.title === 'Access-change smoke questions' && result.data.deck.clientLabel === 'Access Change Co', 'link-only metadata should expose only intentional welcome metadata');
assert(result.data.deck.questions.length === 0, 'link-only metadata should still hide questions');

result = await call(decks, { url: '/api/admin/decks', cookie: admin.cookie });
const beforeBegin = result.data.decks.find((deck) => deck.id === changeDeck.deck.id);
assert(beforeBegin?.responseCount === 0, 'link-only metadata GET should not create a response');

const revisedQuestions = [
  {
    ref: 'respondent-identity',
    type: 'identity',
    section: 'About you',
    prompt: 'Who is submitting this form?',
    required: true,
    fields: [
      { key: 'name', label: 'Your name' },
      { key: 'email', label: 'Kamp Love email' },
    ],
  },
  importDeck.questions[1],
  importDeck.questions[2],
];

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', body: { action: 'revise-questions', id: changeDeck.deck.id, questions: revisedQuestions } });
assert(result.status === 401, 'question revision should require auth');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, body: { action: 'revise-questions', id: changeDeck.deck.id, questions: revisedQuestions } });
assert(result.status === 403, 'question revision should require CSRF');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { action: 'revise-questions', id: changeDeck.deck.id, questions: revisedQuestions } });
assert(result.status === 200 && result.data.deck.versionId !== changeDeck.deck.versionId, 'zero-response deck should receive a new question version');
assert(result.data.deck.accessMode === 'link-only' && result.data.deck.passcodeRequired === false, 'question revision should preserve link-only access');

const revisedEventState = JSON.parse(fs.readFileSync(process.env.ASK_MEMORY_FILE, 'utf8'));
const revisionEvent = revisedEventState.events.find((event) => event.deckId === changeDeck.deck.id && event.eventType === 'questions_revised');
assert(revisionEvent?.metadata?.questionCount === 3 && revisionEvent.metadata?.schemaSha256, 'question revision should record safe schema metadata');
assert(!Object.hasOwn(revisionEvent.metadata, 'questions'), 'question revision events should not retain raw question text');

result = await call(decks, { url: '/api/admin/decks', cookie: admin.cookie });
const afterRevision = result.data.decks.find((deck) => deck.id === changeDeck.deck.id);
assert(afterRevision?.responseCount === 0, 'question revision should not create a response');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: 'smoke-link-only' } });
assert(result.status === 400, 'link-only start should require the explicit Begin action');

result = await call(start, { method: 'POST', url: '/api/public/start', body: { slug: 'smoke-link-only', begin: true } });
assert(result.status === 200 && result.data.resumed === false && result.data.deck.questions.length === 3, 'link-only Begin should start the revised response flow without a passcode');
assert(result.data.deck.questions[0].type === 'identity' && result.data.deck.questions[0].fields.length === 2, 'revised identity should contain exactly name and email');
assert(result.data.deck.questions[0].fields[1].label === 'Kamp Love email', 'revised identity should label the email field');
const linkOnlyDraftCookie = cookieHeader(result.headers['set-cookie']);

result = await call(start, { method: 'POST', url: '/api/public/start', cookie: linkOnlyDraftCookie, body: { slug: 'smoke-link-only', begin: true } });
assert(result.status === 200 && result.data.resumed === true, 'repeated link-only Begin should resume rather than create another response');

const revisedAnswers = [
  { questionRef: 'respondent-identity', value: { name: 'Link-only Smoke', email: 'not-an-email' } },
  { questionRef: 'import-priority', value: 'draft' },
  { questionRef: 'import-approval', value: true },
];
result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: linkOnlyDraftCookie, body: { answers: revisedAnswers } });
assert(result.status === 400, 'two-field identity should validate email without requiring a role');

revisedAnswers[0].value.email = 'link-only@whatarewecapableof.com';
result = await call(submit, { method: 'POST', url: '/api/public/submit', cookie: linkOnlyDraftCookie, body: { answers: revisedAnswers } });
assert(result.status === 200 && result.data.submitted === true, 'two-field identity should submit without a role');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { action: 'revise-questions', id: changeDeck.deck.id, questions: revisedQuestions } });
assert(result.status === 409, 'question revision should reject any deck with a response');

result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { id: changeDeck.deck.id, access: { mode: 'passcode' } } });
assert(result.status === 409, 'access reconfiguration should reject any deck with a started or submitted response');

const collisionDeckInput = { ...importDeck, title: 'Collision smoke questions', clientLabel: 'Collision Co' };
result = await call(decks, { method: 'POST', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: collisionDeckInput });
assert(result.status === 201, 'collision fixture should import privately');
const collisionDeck = result.data;
result = await call(decks, { method: 'PATCH', url: '/api/admin/decks', cookie: admin.cookie, headers: adminHeaders, body: { id: collisionDeck.deck.id, access: { mode: 'link-only', publicSlug: 'smoke-link-only', publicExposureAcknowledged: true } } });
assert(result.status === 409, 'link-only reconfiguration should reject an occupied slug');

result = await call(publicDeck, { url: `/api/public/deck?slug=${collisionDeck.secret.publicSlug}` });
assert(result.status === 200 && result.data.deck.passcodeRequired === true, 'failed reconfiguration should leave the original private link intact');

result = await call(responses, { url: '/api/admin/responses', cookie: admin.cookie });
assert(result.status === 200 && result.data.responses.length >= 3, 'admin response list should include submitted and started fixtures');
const responseId = result.data.responses.find((response) => response.status === 'submitted')?.id;
assert(responseId, 'a submitted response should remain available to the admin');

result = await call(exportMarkdown, { url: `/api/admin/export?id=${encodeURIComponent(responseId)}`, cookie: admin.cookie });
assert(result.status === 200 && result.raw.includes('Needs follow-up') && result.raw.includes('Boundary'), 'markdown export should include review sections');

const noCookie = await call(responses, { url: '/api/admin/responses' });
assert(noCookie.status === 401, 'admin endpoint should require auth');

const deniedCookie = await call(responses, { url: '/api/admin/responses', cookie: signedCookieFor('someone@whatarewecapableof.com') });
assert(deniedCookie.status === 401, 'admin endpoint should enforce explicit email allowlist');

console.log(JSON.stringify({
  ok: true,
  fingerprint: crypto.createHash('sha256').update(responseId).digest('hex').slice(0, 12),
  checks: [
    'health',
    'metadata-hides-questions',
    'begin-required',
    'passcode',
    'legacy-required-identity-preserved',
    'missing-passcode-material-fails-closed',
    'opaque-draft-cookie',
    'draft-resume',
    'tampered-draft-does-not-resume',
    'duplicate-submit-blocked',
    'admin-auth',
    'admin-allowlist',
    'deck-import-default-passcode',
    'import-csrf',
    'link-only-admin-only',
    'link-only-auth-csrf',
    'link-only-validation',
    'link-only-high-sensitivity-block',
    'link-only-zero-response-guard',
    'link-only-old-slug-invalidated',
    'link-only-event-metadata-minimized',
    'link-only-metadata-no-response',
    'identity-fields-legacy-and-two-field',
    'zero-response-question-revision',
    'question-revision-event-metadata-minimized',
    'link-only-begin',
    'link-only-response-lockout',
    'link-only-slug-collision',
    'markdown-export',
  ],
}, null, 2));
