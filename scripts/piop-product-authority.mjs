import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PIOP_PRODUCT_AUTHORITY = Object.freeze({
  schemaVersion: 1,
  productVersion: '0.2.0',
  sourceCommit: '06741fa64d1d284eebf4497b9354e6a4dcc40636',
  sha256: '33f8b01fd2f9c7ba4f8972613307c22b6ef8f368312a99b82c1d2e13e8c30bcb',
});

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys mismatch: ${actual.join(', ')}`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length < 1) throw new Error(`${label} must be a non-empty string`);
}

export function readAuthoritativeProduct(inputPath) {
  const productPath = path.resolve(inputPath);
  if (!fs.existsSync(productPath)) throw new Error(`product inventory missing: ${productPath}`);
  const bytes = fs.readFileSync(productPath);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== PIOP_PRODUCT_AUTHORITY.sha256) {
    throw new Error(`product inventory digest mismatch: expected ${PIOP_PRODUCT_AUTHORITY.sha256}, received ${digest}`);
  }
  const product = JSON.parse(bytes.toString('utf8'));
  requireExactKeys(product, [
    'schema_version', 'product', 'product_version', 'source_commit', 'updated', 'release_eligible',
    'foundation', 'extensions', 'registrations', 'modules', 'operator_only',
  ], 'product inventory');
  if (product.schema_version !== PIOP_PRODUCT_AUTHORITY.schemaVersion) throw new Error('product inventory schema mismatch');
  if (product.product_version !== PIOP_PRODUCT_AUTHORITY.productVersion) throw new Error('product version mismatch');
  if (product.source_commit !== PIOP_PRODUCT_AUTHORITY.sourceCommit) throw new Error('product source commit mismatch');
  if (product.release_eligible !== false) throw new Error('site inventory must remain release-ineligible');
  if (product.foundation.length !== 8 || product.extensions.length !== 5 || product.modules.length !== 6) {
    throw new Error('product inventory count mismatch');
  }
  const ids = [];
  for (const entry of [...product.foundation, ...product.modules, ...product.operator_only]) {
    requireString(entry.id, 'entry id');
    requireString(entry.name, `${entry.id} name`);
    requireString(entry.version, `${entry.id} version`);
    requireString(entry.state, `${entry.id} state`);
    ids.push(entry.id);
  }
  if (new Set(ids).size !== ids.length) throw new Error('duplicate product inventory id');
  for (const entry of product.foundation) {
    requireExactKeys(entry, ['id', 'name', 'version', 'purpose', 'state'], `foundation ${entry.id}`);
    requireString(entry.purpose, `${entry.id} purpose`);
    if (!entry.state.startsWith('accepted-foundation')) throw new Error(`foundation state invalid: ${entry.id}`);
  }
  for (const entry of product.modules) {
    requireExactKeys(entry, ['id', 'name', 'version', 'purpose', 'readiness', 'state'], `module ${entry.id}`);
    requireString(entry.purpose, `${entry.id} purpose`);
    requireString(entry.readiness, `${entry.id} readiness`);
    if (entry.state !== 'accepted-optional-module') throw new Error(`module state invalid: ${entry.id}`);
  }
  return { product, productPath, digest };
}
