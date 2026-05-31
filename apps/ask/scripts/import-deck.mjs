import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createDeckFromImport, storageConfig } = require('../api/_db.js');

function usage() {
  console.error('Usage: node scripts/import-deck.mjs <deck.json> [--base-url=https://ask.whatarewecapableof.com]');
  process.exit(2);
}

const args = process.argv.slice(2);
const fileArg = args.find((arg) => !arg.startsWith('--'));
if (!fileArg) usage();
const baseUrlArg = args.find((arg) => arg.startsWith('--base-url='));
const baseUrl = baseUrlArg ? baseUrlArg.slice('--base-url='.length) : (process.env.ASK_BASE_URL || 'https://ask.whatarewecapableof.com');

const filePath = path.resolve(process.cwd(), fileArg);
const input = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const storage = storageConfig();
if (!storage.configured) {
  throw new Error('Ask storage is not configured. Set ASK_POSTGRES_URL, POSTGRES_URL, DATABASE_URL, or ASK_STORAGE_MODE=memory for local smoke.');
}

const result = await createDeckFromImport({
  deckInput: input,
  actorUserId: process.env.USER ? `local:${process.env.USER}` : 'local-cli',
  baseUrl,
});

console.log(JSON.stringify({
  ok: true,
  storage: storage.mode,
  deck: result.deck,
  oneTimeSecret: result.secret,
  boundary: 'Do not send this link or use real client data without explicit approval.',
}, null, 2));
