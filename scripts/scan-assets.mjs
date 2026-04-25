#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10);

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif']);
const REFERENCE_EXTS = new Set(['.html', '.css', '.js', '.mjs']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel']);
const SKIP_PATH_PATTERNS = [
  /^proposals\/[^/]+\/img\/src(?:\/|$)/,
  /^proposals\/[^/]+\/slots(?:\/|$)/,
];
const INVENTORY_MD = 'docs/asset-inventory.md';
const INVENTORY_JSON = 'docs/asset-inventory.json';
const DASHBOARD_HTML = 'docs/site-dashboard.html';

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function stripQueryAndHash(value) {
  return value.split('#')[0].split('?')[0];
}

function shouldSkipDir(dirPath, entryName) {
  if (SKIP_DIRS.has(entryName)) return true;
  const rel = toPosix(path.relative(root, dirPath));
  return SKIP_PATH_PATTERNS.some((pattern) => pattern.test(rel));
}

async function walk(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && shouldSkipDir(fullPath, entry.name)) continue;
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function categoryFor(rel) {
  if (['favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'og.png'].includes(rel)) return 'site-shell';
  if (/^proposals\/[^/]+\/img\//.test(rel)) return 'proposal-content';
  if (rel.startsWith('design/reference-analysis/frames/')) return 'design-reference-frames';
  if (rel.startsWith('design/reference-analysis/screenshots/')) return 'design-reference-screenshots';
  if (rel.startsWith('design/reference-analysis/images/')) return 'design-reference-images';
  if (rel.startsWith('design/reference-analysis/_originals/')) return 'design-reference-originals';
  if (rel.startsWith('design/reference-analysis/_quarantine/')) return 'design-reference-quarantine';
  if (rel.startsWith('design/reference-analysis/gifs/')) return 'design-reference-gifs';
  if (rel.startsWith('design/')) return 'design-working';
  return 'unclassified';
}

function isSiteVisibleCategory(category) {
  return category === 'site-shell' || category === 'proposal-content' || category === 'unclassified';
}

function shouldScanReferences(rel, ext) {
  if (!REFERENCE_EXTS.has(ext)) return false;
  if (rel.startsWith('scripts/') || rel.startsWith('docs/') || rel.startsWith('design/')) return false;
  return true;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function metadataFor(filePath, ext) {
  try {
    const buffer = await fs.readFile(filePath);
    const detected = detectImageFormat(buffer) ?? ext.replace('.', '');
    let dimensions = null;
    if (detected === 'png') dimensions = pngDimensions(buffer);
    if (detected === 'jpg') dimensions = jpegDimensions(buffer);
    if (detected === 'gif') dimensions = gifDimensions(buffer);
    if (detected === 'webp') dimensions = webpDimensions(buffer);
    if (detected === 'svg') dimensions = svgDimensions(buffer.toString('utf8'));
    return { detectedFormat: detected, dimensions };
  } catch {
    return { detectedFormat: ext.replace('.', ''), dimensions: null };
  }
}

function detectImageFormat(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  const head = buffer.subarray(0, Math.min(buffer.length, 300)).toString('utf8').trimStart();
  if (head.startsWith('<svg')) return 'svg';
  return null;
}

function pngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function gifDimensions(buffer) {
  if (buffer.length < 10) return null;
  const sig = buffer.toString('ascii', 0, 3);
  if (sig !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;

    if (fourcc === 'VP8X' && data + 10 <= buffer.length) {
      const width = 1 + buffer.readUIntLE(data + 4, 3);
      const height = 1 + buffer.readUIntLE(data + 7, 3);
      return { width, height };
    }

    if (fourcc === 'VP8L' && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      const width = 1 + (bits & 0x3fff);
      const height = 1 + ((bits >> 14) & 0x3fff);
      return { width, height };
    }

    if (fourcc === 'VP8 ' && data + 10 <= buffer.length) {
      const start = data + 3;
      const signature = buffer.toString('hex', start, start + 3);
      if (signature === '9d012a') {
        return {
          width: buffer.readUInt16LE(start + 3) & 0x3fff,
          height: buffer.readUInt16LE(start + 5) & 0x3fff,
        };
      }
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return null;
}

function svgDimensions(source) {
  const svgTag = source.match(/<svg\b[^>]*>/i)?.[0];
  if (!svgTag) return null;
  const width = svgTag.match(/\bwidth=["']?([0-9.]+)(?:px)?["']?/i)?.[1];
  const height = svgTag.match(/\bheight=["']?([0-9.]+)(?:px)?["']?/i)?.[1];
  if (width && height) return { width: Number(width), height: Number(height) };
  const viewBox = svgTag.match(/\bviewBox=["']([0-9.\-\s]+)["']/i)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) return { width: parts[2], height: parts[3] };
  }
  return null;
}

function normalizeRef(raw, sourceRel) {
  const cleaned = stripQueryAndHash(raw.trim().replace(/^['"]|['"]$/g, ''));
  if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('mailto:')) return null;

  if (/^https?:\/\//i.test(cleaned)) {
    const url = new URL(cleaned);
    const host = url.hostname.replace(/^www\./, '');
    if (!['whatarewecapableof.com', 'localhost', '127.0.0.1'].includes(host)) {
      return { raw, rel: null, external: true, rootRelative: false, absolute: true };
    }
    return {
      raw,
      rel: decodeURIComponent(url.pathname.replace(/^\//, '')),
      external: false,
      rootRelative: true,
      absolute: true,
    };
  }

  if (cleaned.startsWith('/')) {
    return {
      raw,
      rel: decodeURIComponent(cleaned.replace(/^\//, '')),
      external: false,
      rootRelative: true,
      absolute: false,
    };
  }

  const sourceDir = path.posix.dirname(sourceRel);
  const rel = path.posix.normalize(path.posix.join(sourceDir === '.' ? '' : sourceDir, cleaned));
  return {
    raw,
    rel: decodeURIComponent(rel),
    external: false,
    rootRelative: false,
    absolute: false,
  };
}

function extractImageRefs(source, sourceRel) {
  const refs = [];
  const imageUrlRegex = /(?:https?:\/\/|\/|\.\.?\/)?[A-Za-z0-9_~@:%+./#?=&-]+\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?[A-Za-z0-9_~@:%+./#?=&-]*)?/gi;
  const matches = source.matchAll(imageUrlRegex);
  for (const match of matches) {
    const normalized = normalizeRef(match[0], sourceRel);
    if (normalized) refs.push(normalized);
  }
  return refs;
}

async function main() {
  const allFiles = await walk(root);
  const assets = [];
  const textFiles = [];

  for (const filePath of allFiles) {
    const rel = toPosix(path.relative(root, filePath));
    const ext = path.extname(rel).toLowerCase();
    if (IMAGE_EXTS.has(ext)) {
      const stat = await fs.stat(filePath);
      const declaredExt = ext.replace('.', '').replace('jpeg', 'jpg');
      const metadata = await metadataFor(filePath, ext);
      const category = categoryFor(rel);
      assets.push({
        path: rel,
        publicPath: `/${rel}`,
        ext: declaredExt,
        detectedFormat: metadata.detectedFormat.replace('jpeg', 'jpg'),
        bytes: stat.size,
        size: formatBytes(stat.size),
        dimensions: metadata.dimensions,
        category,
        usedIn: [],
      });
    } else if (shouldScanReferences(rel, ext)) {
      textFiles.push({ filePath, rel, ext });
    }
  }

  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const references = [];
  const missing = [];
  const relativeLocalRefs = [];

  for (const textFile of textFiles) {
    const source = await fs.readFile(textFile.filePath, 'utf8');
    const refs = extractImageRefs(source, textFile.rel);
    for (const ref of refs) {
      if (ref.external) continue;
      if (!ref.rel) continue;
      const exists = assetByPath.has(ref.rel);
      const record = {
        source: textFile.rel,
        raw: ref.raw,
        normalizedPath: ref.rel,
        exists,
        rootRelative: ref.rootRelative,
        absolute: ref.absolute,
      };
      references.push(record);
      if (exists) {
        assetByPath.get(ref.rel).usedIn.push(textFile.rel);
      } else {
        missing.push(record);
      }
      if (!ref.rootRelative && !ref.absolute) {
        relativeLocalRefs.push(record);
      }
    }
  }

  for (const asset of assets) {
    asset.usedIn = [...new Set(asset.usedIn)].sort();
  }

  const summary = {
    generatedAt: today,
    root,
    assetCount: assets.length,
    siteVisibleAssetCount: assets.filter((asset) => isSiteVisibleCategory(asset.category)).length,
    referencedAssetCount: assets.filter((asset) => asset.usedIn.length > 0).length,
    unreferencedSiteVisibleAssetCount: assets.filter((asset) => isSiteVisibleCategory(asset.category) && asset.usedIn.length === 0).length,
    missingReferenceCount: missing.length,
    relativeLocalReferenceCount: relativeLocalRefs.length,
    formatMismatchCount: assets.filter((asset) => asset.detectedFormat && asset.detectedFormat !== asset.ext).length,
    categories: assets.reduce((acc, asset) => {
      acc[asset.category] = (acc[asset.category] ?? 0) + 1;
      return acc;
    }, {}),
  };

  const output = { summary, assets, references, missing, relativeLocalRefs };
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, INVENTORY_JSON), `${JSON.stringify(output, null, 2)}\n`);
  await fs.writeFile(path.join(root, INVENTORY_MD), renderMarkdown(output));
  await fs.writeFile(path.join(root, DASHBOARD_HTML), renderDashboard(output));

  console.log(`Scanned ${summary.assetCount} image assets.`);
  console.log(`Wrote ${INVENTORY_MD}, ${INVENTORY_JSON}, and ${DASHBOARD_HTML}.`);
  if (summary.missingReferenceCount > 0) console.log(`Missing references: ${summary.missingReferenceCount}`);
  if (summary.relativeLocalReferenceCount > 0) console.log(`Relative local asset references: ${summary.relativeLocalReferenceCount}`);
}

function renderMarkdown({ summary, assets, missing, relativeLocalRefs }) {
  const siteAssets = assets
    .filter((asset) => isSiteVisibleCategory(asset.category))
    .sort((a, b) => a.path.localeCompare(b.path));
  const unreferencedSiteAssets = siteAssets.filter((asset) => asset.usedIn.length === 0);
  const formatMismatches = assets.filter((asset) => asset.detectedFormat && asset.detectedFormat !== asset.ext);
  const categoryRows = Object.entries(summary.categories)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => `| ${escapeCell(category)} | ${count} |`)
    .join('\n');

  const siteRows = siteAssets.map((asset) => {
    const dims = asset.dimensions ? `${asset.dimensions.width}x${asset.dimensions.height}` : 'unknown';
    const used = asset.usedIn.length ? asset.usedIn.join('<br>') : 'unreferenced';
    const format = asset.detectedFormat && asset.detectedFormat !== asset.ext
      ? `${asset.ext.toUpperCase()} file, ${asset.detectedFormat.toUpperCase()} data`
      : asset.ext.toUpperCase();
    return `| \`${escapeCell(asset.path)}\` | ${asset.category} | ${format} | ${dims} | ${asset.size} | ${escapeCell(used)} |`;
  }).join('\n');

  const mismatchRows = formatMismatches.length
    ? formatMismatches.map((asset) => `| \`${escapeCell(asset.path)}\` | ${asset.ext.toUpperCase()} | ${asset.detectedFormat.toUpperCase()} |`).join('\n')
    : '| None |  |  |';

  const missingRows = missing.length
    ? missing.map((ref) => `| \`${escapeCell(ref.normalizedPath)}\` | \`${escapeCell(ref.source)}\` | \`${escapeCell(ref.raw)}\` |`).join('\n')
    : '| None |  |  |';

  const relativeRows = relativeLocalRefs.length
    ? relativeLocalRefs.map((ref) => `| \`${escapeCell(ref.raw)}\` | \`${escapeCell(ref.source)}\` | Resolves to \`${escapeCell(ref.normalizedPath)}\` |`).join('\n')
    : '| None |  |  |';

  const unreferencedRows = unreferencedSiteAssets.length
    ? unreferencedSiteAssets.map((asset) => `- \`${asset.path}\` (${asset.category}, ${asset.size})`).join('\n')
    : '- None';

  return `# Asset Inventory\n\nGenerated by \`node scripts/scan-assets.mjs\` on ${summary.generatedAt}.\n\n## Summary\n\n- Image assets scanned: ${summary.assetCount}\n- Site and proposal assets: ${summary.siteVisibleAssetCount}\n- Referenced assets: ${summary.referencedAssetCount}\n- Unreferenced site and proposal assets: ${summary.unreferencedSiteVisibleAssetCount}\n- Missing local asset references: ${summary.missingReferenceCount}\n- Relative local asset references: ${summary.relativeLocalReferenceCount}\n- Extension and file-data mismatches: ${summary.formatMismatchCount}\n\n## Asset categories\n\n| Category | Count |\n|---|---:|\n${categoryRows}\n\n## Site and proposal assets\n\nThese are the image assets most likely to matter during Cursor review. Design reference images and extracted motion frames are counted above and stored in \`docs/asset-inventory.json\`.\n\n| File | Category | Format | Dimensions | Size | Referenced by |\n|---|---|---|---:|---:|---|\n${siteRows || '| None |  |  |  |  |  |'}\n\n## Unreferenced site and proposal assets\n\n${unreferencedRows}\n\n## Extension and file-data mismatches\n\n| File | Extension says | File data says |\n|---|---|---|\n${mismatchRows}\n\n## Missing local asset references\n\n| Missing file | Referenced from | Raw reference |\n|---|---|---|\n${missingRows}\n\n## Relative local asset references\n\nRoot-relative paths are required on this site because Vercel serves directory pages with and without trailing slashes. This section should stay empty for local assets.\n\n| Raw reference | Source | Notes |\n|---|---|---|\n${relativeRows}\n\n## Notes for Cursor review\n\n- Open this file beside \`proposals/compassion/index.html\` and \`proposals/compassion/img/\` when reviewing proposal imagery.\n- Open \`docs/site-dashboard.html\` through localhost for a visual dashboard.\n- Treat \`design/reference-analysis/\` as working reference material, not production content.\n- Use \`docs/asset-inventory.json\` when a full file-level list is easier to inspect or transform.\n`;
}

function routeForSource(source) {
  if (source === 'index.html') return '/';
  if (source.endsWith('/index.html')) return `/${source.slice(0, -'/index.html'.length)}`;
  return `/${source}`;
}

function formatForDisplay(asset) {
  if (!asset) return 'unknown';
  return asset.detectedFormat && asset.detectedFormat !== asset.ext
    ? `${asset.ext.toUpperCase()} file, ${asset.detectedFormat.toUpperCase()} data`
    : asset.ext.toUpperCase();
}

function dimensionsForDisplay(asset) {
  if (!asset?.dimensions) return 'unknown';
  return `${asset.dimensions.width}x${asset.dimensions.height}`;
}

function renderDashboard({ summary, assets, references, missing, relativeLocalRefs }) {
  const assetByPath = new Map(assets.map((asset) => [asset.path, asset]));
  const siteAssets = assets
    .filter((asset) => isSiteVisibleCategory(asset.category))
    .sort((a, b) => a.path.localeCompare(b.path));
  const unreferencedSiteAssets = siteAssets.filter((asset) => asset.usedIn.length === 0);
  const formatMismatches = siteAssets.filter((asset) => asset.detectedFormat && asset.detectedFormat !== asset.ext);
  const pageSources = [...new Set(references.map((ref) => ref.source))].sort();

  const statCards = [
    ['Image assets', summary.assetCount],
    ['Site and proposal assets', summary.siteVisibleAssetCount],
    ['Referenced assets', summary.referencedAssetCount],
    ['Unreferenced site/proposal', summary.unreferencedSiteVisibleAssetCount],
    ['Missing references', summary.missingReferenceCount],
    ['Relative local references', summary.relativeLocalReferenceCount],
    ['Format mismatches', summary.formatMismatchCount],
  ].map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

  const pageCards = pageSources.map((source) => {
    const refs = references.filter((ref) => ref.source === source && ref.exists);
    const uniquePaths = [...new Set(refs.map((ref) => ref.normalizedPath))];
    const contentAssets = uniquePaths
      .map((assetPath) => assetByPath.get(assetPath))
      .filter((asset) => asset && asset.category !== 'site-shell');
    const chips = uniquePaths.map((assetPath) => {
      const asset = assetByPath.get(assetPath);
      const label = asset ? asset.path : assetPath;
      const type = asset?.category === 'site-shell' ? 'shell' : 'content';
      return `<li class="chip ${type}">${escapeHtml(label)}</li>`;
    }).join('');
    const thumbs = contentAssets.length
      ? contentAssets.map((asset) => `<img src="/${escapeHtml(asset.path)}" alt="${escapeHtml(asset.path)}" loading="lazy">`).join('')
      : '<p class="muted">Shell assets only.</p>';

    return `<article class="page-card">
      <div class="page-card-head">
        <div>
          <h3>${escapeHtml(routeForSource(source))}</h3>
          <p>${escapeHtml(source)}</p>
        </div>
        <strong>${uniquePaths.length}</strong>
      </div>
      <div class="thumb-row">${thumbs}</div>
      <ul>${chips}</ul>
    </article>`;
  }).join('');

  const assetCards = siteAssets.map((asset) => {
    const status = asset.usedIn.length ? 'used' : 'unused';
    const usedIn = asset.usedIn.length ? asset.usedIn.map((source) => `<li>${escapeHtml(source)}</li>`).join('') : '<li>Unreferenced</li>';
    return `<article class="asset-card ${status}">
      <div class="asset-image"><img src="/${escapeHtml(asset.path)}" alt="${escapeHtml(asset.path)}" loading="lazy"></div>
      <div class="asset-meta">
        <h3>${escapeHtml(asset.path)}</h3>
        <p>${escapeHtml(asset.category)} · ${escapeHtml(formatForDisplay(asset))} · ${escapeHtml(dimensionsForDisplay(asset))} · ${escapeHtml(asset.size)}</p>
        <ul>${usedIn}</ul>
      </div>
    </article>`;
  }).join('');

  const attentionItems = [
    ['Missing local references', missing.map((ref) => `${ref.normalizedPath} in ${ref.source}`)],
    ['Relative local references', relativeLocalRefs.map((ref) => `${ref.raw} in ${ref.source}`)],
    ['Extension mismatches', formatMismatches.map((asset) => `${asset.path}: ${asset.ext.toUpperCase()} extension, ${asset.detectedFormat.toUpperCase()} data`)],
    ['Unreferenced site/proposal assets', unreferencedSiteAssets.map((asset) => asset.path)],
  ].map(([title, items]) => `<section class="attention-block">
      <h3>${escapeHtml(title)}</h3>
      ${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}
    </section>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>What are we capable of? Site Dashboard</title>
  <style>
    :root { --bg: #fff; --text: #000; --muted: #555; --line: #000; --surface: #f7f7f7; --accent: rgb(0, 15, 255); }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    a { color: inherit; }
    header { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 24px; }
    header h1 { margin: 0 0 8px; font: 400 28px/1.1 Georgia, serif; letter-spacing: -0.02em; }
    header p { margin: 0; color: var(--muted); }
    main { padding: 24px; }
    section { margin: 0 0 48px; }
    h2 { margin: 0 0 16px; font: 400 18px/1.2 Georgia, serif; }
    h3 { margin: 0; font-size: 12px; line-height: 1.35; word-break: break-word; }
    p { margin: 0; }
    ul { margin: 12px 0 0; padding-left: 16px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); border: 1px solid var(--line); }
    .stat { padding: 16px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); min-height: 96px; }
    .stat span { display: block; color: var(--muted); }
    .stat strong { display: block; margin-top: 8px; font-size: 28px; line-height: 1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .page-card, .asset-card, .attention-block { border: 1px solid var(--line); background: var(--bg); padding: 16px; }
    .page-card-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .page-card-head p, .asset-meta p, .muted { color: var(--muted); }
    .thumb-row { display: flex; gap: 8px; overflow-x: auto; margin-top: 16px; min-height: 80px; }
    .thumb-row img { width: 96px; height: 96px; object-fit: cover; border: 1px solid var(--line); background: var(--surface); }
    .chip { list-style: none; margin: 0 0 4px; padding: 4px 6px; background: var(--surface); word-break: break-word; }
    .chip.shell { color: var(--muted); }
    .asset-card { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; }
    .asset-card.unused { border-color: var(--accent); }
    .asset-image { width: 120px; height: 120px; border: 1px solid var(--line); background: var(--surface); display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .asset-image img { width: 100%; height: 100%; object-fit: contain; }
    .attention { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .attention-block ul { max-height: 280px; overflow: auto; }
    .note { margin: 16px 0 0; padding: 12px; background: var(--surface); }
  </style>
</head>
<body>
  <header>
    <h1>What are we capable of? Site Dashboard</h1>
    <p>Generated by <code>npm run scan:assets</code> on ${escapeHtml(summary.generatedAt)}. Open through <code>http://localhost:8888/docs/site-dashboard.html</code> so thumbnails resolve from the project root.</p>
  </header>
  <main>
    <section>
      <h2>Summary</h2>
      <div class="stats">${statCards}</div>
      <p class="note">Cursor use: keep this dashboard open beside the file tree and the local page preview. It is a viewing aid, not an editing surface.</p>
    </section>
    <section>
      <h2>Pages and their image files</h2>
      <div class="grid">${pageCards}</div>
    </section>
    <section>
      <h2>Site and proposal asset gallery</h2>
      <div class="grid">${assetCards}</div>
    </section>
    <section>
      <h2>Attention queue</h2>
      <div class="attention">${attentionItems}</div>
    </section>
  </main>
</body>
</html>
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
