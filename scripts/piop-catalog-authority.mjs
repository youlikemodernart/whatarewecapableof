import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PIOP_CATALOG_AUTHORITY = Object.freeze({
  schemaVersion: 1,
  catalogVersion: '0.1.7',
  sha256: '1e2f837b6894a9d5a404ab230e9231f6c3759eee3b47b7aed120dc28f5b7096a',
});

export function publicPrivateDataBoundary(value) {
  if (value === 'none') {
    return 'No private data is included in the package. Runtime handling of user-provided content follows the selected method and active request.';
  }
  return value;
}

export function readAuthoritativeCatalog(inputPath) {
  const catalogPath = path.resolve(inputPath);
  if (!fs.existsSync(catalogPath)) throw new Error(`catalog missing: ${catalogPath}`);
  const bytes = fs.readFileSync(catalogPath);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== PIOP_CATALOG_AUTHORITY.sha256) {
    throw new Error(`catalog digest mismatch: expected ${PIOP_CATALOG_AUTHORITY.sha256}, received ${digest}`);
  }
  const catalog = JSON.parse(bytes.toString('utf8'));
  if (catalog.schema_version !== PIOP_CATALOG_AUTHORITY.schemaVersion) {
    throw new Error(`catalog schema mismatch: expected ${PIOP_CATALOG_AUTHORITY.schemaVersion}`);
  }
  if (catalog.catalog_version !== PIOP_CATALOG_AUTHORITY.catalogVersion) {
    throw new Error(`catalog version mismatch: expected ${PIOP_CATALOG_AUTHORITY.catalogVersion}`);
  }
  return { catalog, catalogPath, digest };
}
