import crypto from 'node:crypto';
import { validateOrganizationEmailProfile } from './email-expression-profile.mjs';

export const EMAIL_RENDERER_CONTRACT_VERSION = '1.0';
const FONT_MAP = Object.freeze({
  'system-sans': "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
  'georgia-serif': "Georgia,'Times New Roman',serif",
  'system-mono': "ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace",
});
const HARD_LIMITS = Object.freeze({ smallTables: 2, inlineFigures: 2, highlights: 20 });

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function lowerColor(value) { return String(value).toLowerCase(); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function resolveEmailPresentation(profileInput, { allowProvisional = false } = {}) {
  const validated = profileInput?.profile && profileInput?.profileSha256
    ? profileInput
    : validateOrganizationEmailProfile(profileInput);
  const { profile } = validated;
  if (profile.status !== 'accepted' && !(allowProvisional && profile.status === 'provisional')) {
    throw new Error(`Email rendering requires an accepted profile; received ${profile.status}.`);
  }
  const visual = profile.visual;
  if (!visual.rendering) throw new Error('Email profile is missing visual.rendering and cannot drive the deterministic renderer.');
  for (const [component, hardLimit] of Object.entries(HARD_LIMITS)) {
    const selected = profile.components[component].maxCount;
    if (selected > hardLimit) throw new Error(`Email profile ${component} maximum ${selected} exceeds renderer hard ceiling ${hardLimit}.`);
  }
  const r = visual.rendering;
  const presentation = {
    measurePx: visual.measurePx,
    fonts: { body: FONT_MAP[visual.bodyFont], mono: FONT_MAP[visual.monoFont] },
    body: { sizePx: visual.bodySizePx, lineHeightPx: visual.bodyLineHeightPx },
    typography: structuredClone(r.typography),
    spacing: structuredClone(r.spacing),
    colors: {
      text: lowerColor(visual.colors.text),
      mutedText: lowerColor(visual.colors.mutedText),
      link: lowerColor(visual.colors.link),
      rule: lowerColor(visual.colors.rule),
      surfaceMuted: lowerColor(visual.colors.surfaceMuted),
      highlightText: lowerColor(visual.colors.highlightText),
      strongRule: lowerColor(r.rules.strongRule),
      quoteRule: lowerColor(r.rules.quoteRule),
    },
    rules: {
      quoteWidthPx: r.rules.quoteWidthPx,
      codeRadiusPx: r.rules.codeRadiusPx,
      inlineCodeRadiusPx: r.rules.inlineCodeRadiusPx,
    },
    figureCaps: structuredClone(r.figures),
    highlightPalettes: {
      sun: lowerColor(r.highlightPalettes.default),
      'hot-pink': lowerColor(r.highlightPalettes.hotPink),
    },
    components: {
      headings: profile.components.headings,
      lists: profile.components.lists,
      blockquote: profile.components.blockquote,
      code: profile.components.code,
      smallTables: profile.components.smallTables.maxCount,
      inlineFigures: profile.components.inlineFigures.maxCount,
      highlights: profile.components.highlights.maxCount,
    },
  };
  if (presentation.figureCaps.landscapeMaxPx > presentation.measurePx) {
    throw new Error('Email profile landscape figure cap cannot exceed its content measure.');
  }
  const resolvedPresentationSha256 = crypto.createHash('sha256').update(canonicalJson(presentation)).digest('hex');
  return {
    presentation: deepFreeze(presentation),
    record: Object.freeze({
      schemaVersion: profile.schemaVersion,
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      profileSha256: validated.profileSha256,
      rendererContractVersion: EMAIL_RENDERER_CONTRACT_VERSION,
      resolvedPresentationSha256,
    }),
  };
}
