// Generates sitemap.xml for the public, indexable surface of whatarewecapableof.com.
// Public routes are explicit; blog articles are auto-discovered from blog/<slug>/index.html.
// lastmod uses the true git commit date per file (best practice, not a build timestamp),
// falling back to file mtime for not-yet-committed files.
//
// Run: node scripts/generate-sitemap.mjs
// Keep the route list in sync with robots.txt's Allow rules.
import { execSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://whatarewecapableof.com';

// Explicit public routes -> the repo file that backs each one.
const STATIC_ROUTES = [
  { url: '/', file: 'index.html' },
  { url: '/how-we-work', file: 'how-we-work/index.html' },
  { url: '/where-we-help', file: 'where-we-help/index.html' },
  { url: '/blog', file: 'blog/index.html' },
  { url: '/question', file: 'question/index.html' },
];

// Auto-discover blog articles: blog/<slug>/index.html (excluding the blog index itself).
function discoverBlogArticles() {
  const blogDir = path.join(ROOT, 'blog');
  if (!existsSync(blogDir)) return [];
  const out = [];
  for (const entry of readdirSync(blogDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join('blog', entry.name, 'index.html');
    if (existsSync(path.join(ROOT, file))) out.push({ url: `/blog/${entry.name}`, file });
  }
  return out;
}

function lastmod(file) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${file}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (iso) return iso.slice(0, 10);
  } catch { /* not committed yet */ }
  try { return statSync(path.join(ROOT, file)).mtime.toISOString().slice(0, 10); } catch { return new Date().toISOString().slice(0, 10); }
}

const routes = [...STATIC_ROUTES, ...discoverBlogArticles()].filter((r) => existsSync(path.join(ROOT, r.file)));
const body = routes
  .map((r) => `  <url>\n    <loc>${ORIGIN}${r.url}</loc>\n    <lastmod>${lastmod(r.file)}</lastmod>\n  </url>`)
  .join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

console.log(`Wrote sitemap.xml with ${routes.length} URLs:`);
for (const r of routes) console.log(`  ${ORIGIN}${r.url}  (lastmod ${lastmod(r.file)})`);
