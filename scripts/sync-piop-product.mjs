#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readAuthoritativeProduct } from './piop-product-authority.mjs';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check') {
      args.check = true;
      continue;
    }
    if (!token?.startsWith('--')) fail(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function replaceRegion(page, start, end, rendered) {
  const first = page.indexOf(start);
  const last = page.indexOf(end);
  if (first === -1 || last === -1 || last <= first) fail(`missing or reversed markers: ${start} / ${end}`);
  return `${page.slice(0, first + start.length)}\n${rendered}\n        ${page.slice(last)}`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.product) fail('usage: node scripts/sync-piop-product.mjs --product scripts/data/piop-product.json [--page piop/index.html] [--check]');
const pagePath = path.resolve(args.page || 'piop/index.html');
if (!fs.existsSync(pagePath)) fail(`page missing: ${pagePath}`);
let product;
try {
  ({ product } = readAuthoritativeProduct(args.product));
} catch (error) {
  fail(error.message);
}

const packages = product.foundation.map((entry) => `${escapeHtml(entry.name)} <span class="inventory-version">v${escapeHtml(entry.version)}</span>`).join(' &middot; ');
const extensions = product.extensions.map((entry) => `${escapeHtml(entry.name)}${entry.version.startsWith('accepted ') ? '' : ` <span class="inventory-version">v${escapeHtml(entry.version)}</span>`}`).join(' &middot; ');
const foundation = `        <tr><th scope="row">Packages</th><td>${packages}</td></tr>\n        <tr><th scope="row">Extensions</th><td>${extensions}</td></tr>`;
const modules = product.modules.map((entry) => `        <tr id="module-${escapeHtml(entry.id)}"><th scope="row">${escapeHtml(entry.name)} <span class="inventory-version">v${escapeHtml(entry.version)}</span></th><td>${escapeHtml(entry.purpose)} <span class="inventory-adds">Adds: ${escapeHtml(entry.adds)}.</span></td><td>${escapeHtml(entry.readiness)}</td></tr>`).join('\n');
const status = `PiOp ${product.product_version} stable. Foundation contains ${product.foundation.length} packages and ${product.extensions.length} default extensions. Environment Context and Generic Model Profile remain outside the released default until their lifecycle and recipient-bundle acceptance passes.`;

const original = fs.readFileSync(pagePath, 'utf8');
let page = original;
page = replaceRegion(page, '<!-- PIOP_FOUNDATION_START -->', '<!-- PIOP_FOUNDATION_END -->', foundation);
page = replaceRegion(page, '<!-- PIOP_MODULES_START -->', '<!-- PIOP_MODULES_END -->', modules);
page = replaceRegion(page, '<!-- PIOP_FOUNDATION_STATUS_START -->', '<!-- PIOP_FOUNDATION_STATUS_END -->', escapeHtml(status));
if (args.check) {
  if (page !== original) fail('PiOp product projection is out of sync');
  console.log(`PASS piop_product_check foundation=${product.foundation.length} modules=${product.modules.length} extensions=${product.extensions.length} product_version=${product.product_version}`);
} else {
  fs.writeFileSync(pagePath, page);
  console.log(`PASS piop_product_sync foundation=${product.foundation.length} modules=${product.modules.length} extensions=${product.extensions.length} product_version=${product.product_version}`);
}
