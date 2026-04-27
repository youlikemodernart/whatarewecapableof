import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function walk(dir, predicate = () => true) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'slots') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(root, file);
}

const proposalHtml = walk(path.join(root, 'proposals'), file => file.endsWith('index.html'));
const cssFiles = [
  path.join(root, 'css', 'components.css'),
  path.join(root, 'css', 'proposal-media.css'),
].filter(file => fs.existsSync(file));

const filesToCheck = [...proposalHtml, ...cssFiles];

const badSelectorPatterns = [
  {
    name: 'table body text must stay --size-m',
    regex: /table\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'scope list text must stay --size-m',
    regex: /\.scope-phase\s+li\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'proposal output lines must stay --size-m',
    regex: /\.proposal-output\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'placeholder descriptions must stay --size-m',
    regex: /\.placeholder-item\s+p\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'specimen descriptions must stay --size-m',
    regex: /\.specimen-desc\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'process strip paragraph text must stay --size-m',
    regex: /\.proposal-process-step\s+p\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'process timeline paragraph text must stay --size-m',
    regex: /\.proposal-process-timeline-content\s+p\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'diagram and excerpt pre text must stay --size-m',
    regex: /\.(?:proposal-diagram|proposal-excerpt)\s+pre[^}]*font-size:\s*var\(--size-s\)/g,
  },
  {
    name: 'video transcript text must stay --size-m',
    regex: /\.proposal-video-transcript\s*\{[^}]*font-size:\s*var\(--size-s\)/g,
  },
];

for (const file of filesToCheck) {
  const text = fs.readFileSync(file, 'utf8');
  for (const { name, regex } of badSelectorPatterns) {
    regex.lastIndex = 0;
    if (regex.test(text)) {
      failures.push(`${relative(file)}: ${name}`);
    }
  }

  const largeToken = /font-size:\s*var\(--size-(?:l|xl)\)/g;
  if (largeToken.test(text)) {
    failures.push(`${relative(file)}: proposal files cannot use --size-l or --size-xl for recurring hierarchy`);
  }
}

const svgFiles = walk(path.join(root, 'proposals'), file => file.endsWith('.svg'));
for (const file of svgFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const weightMatch = text.match(/font-weight=["'](?:[6-9]00|bold)["']/i);
  if (weightMatch) {
    failures.push(`${relative(file)}: SVG text uses bold font weight`);
  }

  const sizeMatches = [...text.matchAll(/font-size=["']([0-9.]+)(?:px)?["']/gi)];
  for (const match of sizeMatches) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 22) {
      failures.push(`${relative(file)}: SVG text size ${value} exceeds the proposal graphic ceiling`);
    }
  }

  const genericPalette = /#(?:111827|1d4ed8|3730a3|64748b|94a3b8|cbd5e1|d5dae3|dbeafe|e8f2ff|eef2ff|f8fafc|fff7ed|fdba74)/i;
  if (genericPalette.test(text)) {
    failures.push(`${relative(file)}: SVG uses generic SaaS/Tailwind palette values`);
  }
}

if (failures.length) {
  console.error('Type hierarchy check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Type hierarchy check passed.');
