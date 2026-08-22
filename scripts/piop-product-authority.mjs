import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PIOP_PRODUCT_AUTHORITY = Object.freeze({
  schemaVersion: 1,
  productVersion: '0.2.3',
  sourceCommit: 'ab35ad82fee276e2ebc7ea7550b55ae9799418fb',
  sha256: 'b25404649b85a4cbf63a004c1196c38fcd070652d3d4236e065bc82223e636ff',
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
  if (product.release_eligible !== true) throw new Error('site inventory must describe the accepted stable release');
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
    requireExactKeys(entry, ['id', 'name', 'version', 'purpose', 'adds', 'state'], `foundation ${entry.id}`);
    requireString(entry.purpose, `${entry.id} purpose`);
    requireString(entry.adds, `${entry.id} adds`);
    if (!entry.state.startsWith('accepted-foundation')) throw new Error(`foundation state invalid: ${entry.id}`);
  }
  for (const entry of product.modules) {
    requireExactKeys(entry, ['id', 'name', 'version', 'purpose', 'adds', 'readiness', 'state'], `module ${entry.id}`);
    requireString(entry.purpose, `${entry.id} purpose`);
    requireString(entry.adds, `${entry.id} adds`);
    requireString(entry.readiness, `${entry.id} readiness`);
    if (entry.state !== 'accepted-optional-module') throw new Error(`module state invalid: ${entry.id}`);
  }
  return { product, productPath, digest };
}
