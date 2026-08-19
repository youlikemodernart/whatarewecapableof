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
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'check') {
      args.check = true;
      continue;
    }
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
  return `${page.slice(0, first + start.length)}\n${rendered}\n          ${page.slice(last)}`;
}

function renderFoundation(entry) {
  return `          <dt>${escapeHtml(entry.name)} <span class="inventory-version">v${escapeHtml(entry.version)}</span></dt>\n          <dd>${escapeHtml(entry.purpose)} <span class="inventory-adds">Adds: ${escapeHtml(entry.adds)}.</span></dd>`;
}

function renderModule(entry) {
  return `          <dt>${escapeHtml(entry.name)} <span class="inventory-version">v${escapeHtml(entry.version)}</span></dt>\n          <dd>${escapeHtml(entry.purpose)} <span class="inventory-adds">Adds: ${escapeHtml(entry.adds)}.</span><span class="inventory-readiness">Ready requires: ${escapeHtml(entry.readiness)}.</span></dd>`;
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

const original = fs.readFileSync(pagePath, 'utf8');
let page = original;
page = replaceRegion(page, '<!-- PIOP_FOUNDATION_START -->', '<!-- PIOP_FOUNDATION_END -->', product.foundation.map(renderFoundation).join('\n'));
page = replaceRegion(page, '<!-- PIOP_MODULES_START -->', '<!-- PIOP_MODULES_END -->', product.modules.map(renderModule).join('\n'));
const status = `Foundation currently contains ${product.foundation.length} packages and ${product.extensions.length} default extensions. Environment Context and Generic Model Profile are source-integrated and release-ineligible pending granular lifecycle and recipient-bundle acceptance. Product version ${product.product_version} remains release-ineligible.`;
page = replaceRegion(page, '<!-- PIOP_FOUNDATION_STATUS_START -->', '<!-- PIOP_FOUNDATION_STATUS_END -->', escapeHtml(status));

if (args.check) {
  if (page !== original) fail('PiOp product projection is out of sync');
  console.log(`PASS piop_product_check foundation=${product.foundation.length} modules=${product.modules.length} extensions=${product.extensions.length} product_version=${product.product_version}`);
} else {
  fs.writeFileSync(pagePath, page);
  console.log(`PASS piop_product_sync foundation=${product.foundation.length} modules=${product.modules.length} extensions=${product.extensions.length} product_version=${product.product_version}`);
}
