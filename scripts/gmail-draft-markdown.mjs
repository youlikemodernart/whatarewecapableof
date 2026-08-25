import MarkdownIt from 'markdown-it';

const SAFE_LINK_RE = /^(?:https?:|mailto:)/i;
const BODY_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO_FONT = "ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace";
export const LEGACY_WAWCO_PRESENTATION = Object.freeze({
  measurePx: 640,
  fonts: Object.freeze({ body: BODY_FONT, mono: MONO_FONT }),
  body: Object.freeze({ sizePx: 16, lineHeightPx: 24 }),
  typography: Object.freeze({
    h1: Object.freeze({ sizePx: 24, lineHeightPx: 30, weight: 700 }),
    h2: Object.freeze({ sizePx: 20, lineHeightPx: 26, weight: 700 }),
    h3: Object.freeze({ sizePx: 17, lineHeightPx: 24, weight: 700 }),
    inlineCode: Object.freeze({ sizePx: 14, lineHeightPx: 20, weight: 400 }),
    codeBlock: Object.freeze({ sizePx: 13, lineHeightPx: 20, weight: 400 }),
    table: Object.freeze({ sizePx: 14, lineHeightPx: 20, weight: 400 }),
    tableHeader: Object.freeze({ sizePx: 13, lineHeightPx: 18, weight: 700 }),
    caption: Object.freeze({ sizePx: 13, lineHeightPx: 18, weight: 400 }),
  }),
  spacing: Object.freeze({
    paragraphAfterPx: 16, h1AfterPx: 16, h2BeforePx: 28, h2AfterPx: 12,
    h3BeforePx: 24, h3AfterPx: 10, listAfterPx: 20, blockquoteAfterPx: 20,
    ruleVerticalPx: 24, tableAfterPx: 24, figureBeforePx: 8, figureAfterPx: 24, captionBeforePx: 10,
  }),
  colors: Object.freeze({
    text: '#202124', mutedText: '#5f6368', link: '#174ea6', rule: '#dadce0',
    surfaceMuted: '#f1f3f4', highlightText: '#202124', strongRule: '#5f6368', quoteRule: '#bdc1c6',
  }),
  rules: Object.freeze({ quoteWidthPx: 2, codeRadiusPx: 4, inlineCodeRadiusPx: 3 }),
  figureCaps: Object.freeze({ landscapeMaxPx: 640, squareMaxPx: 520, portraitMaxPx: 440, tallMaxPx: 360 }),
  highlightPalettes: Object.freeze({ sun: '#ffe08a', 'hot-pink': '#ff4fd8' }),
  components: Object.freeze({ headings: true, lists: true, blockquote: true, code: true, smallTables: 2, inlineFigures: 2, highlights: 20 }),
});
export const MAX_TABLE_COUNT = 2;
export const MAX_TABLE_COLUMNS = 3;
export const MAX_TABLE_ROWS = 20;
const MAX_TABLE_CELL_CHARS = 500;
export const MAX_HIGHLIGHT_COUNT = 20;
export const MAX_HIGHLIGHT_CHARS = 240;
export const HIGHLIGHT_PALETTE = Object.freeze({
  sun: '#ffe08a',
  'hot-pink': '#ff4fd8',
});
const DEFAULT_HIGHLIGHT = 'sun';
export const MARKDOWN_STRUCTURE_VERSION = 1;
const MARKDOWN_STRUCTURE_KEYS = Object.freeze([
  'version',
  'h1Count',
  'h2Count',
  'h3Count',
  'h4Count',
  'h5Count',
  'h6Count',
  'paragraphCount',
  'bulletListCount',
  'orderedListCount',
  'listItemCount',
  'blockquoteCount',
  'tableCount',
  'linkCount',
  'strongCount',
  'emphasisCount',
  'inlineCodeCount',
  'codeBlockCount',
  'horizontalRuleCount',
  'highlightCount',
  'softbreakCount',
  'hardbreakCount',
]);
const MAX_MARKDOWN_STRUCTURE_HEADER_CHARS = 2048;

function highlightPlugin(md, { presentation = LEGACY_WAWCO_PRESENTATION } = {}) {
  md.inline.ruler.before('emphasis', 'wawco_highlight', (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 2) !== '==') return false;

    let contentStart = start + 2;
    let paletteName = DEFAULT_HIGHLIGHT;
    if (state.src[contentStart] === '{') {
      const paletteEnd = state.src.indexOf('}', contentStart + 1);
      if (paletteEnd === -1) return false;
      paletteName = state.src.slice(contentStart + 1, paletteEnd);
      if (!Object.hasOwn(presentation.highlightPalettes, paletteName)) {
        throw new Error(`Markdown highlight uses unsupported palette name: ${paletteName || '(empty)'}.`);
      }
      contentStart = paletteEnd + 1;
    }

    const end = state.src.indexOf('==', contentStart);
    if (end === -1) return false;
    const content = state.src.slice(contentStart, end);
    if (!content || /^\s|\s$/.test(content) || content.includes('\n')) return false;
    if (content.length > MAX_HIGHLIGHT_CHARS) {
      throw new Error(`Markdown highlights support at most ${MAX_HIGHLIGHT_CHARS} characters.`);
    }
    if (silent) return true;

    const open = state.push('wawco_highlight_open', 'span', 1);
    open.meta = { paletteName };
    const text = state.push('text', '', 0);
    text.content = content;
    state.push('wawco_highlight_close', 'span', -1);
    state.pos = end + 2;
    return true;
  });

  md.renderer.rules.wawco_highlight_open = (tokens, index) => {
    const paletteName = tokens[index].meta?.paletteName || DEFAULT_HIGHLIGHT;
    const background = presentation.highlightPalettes[paletteName];
    return `<span style="background:${background};color:${presentation.colors.highlightText};padding:1px 2px;">`;
  };
  md.renderer.rules.wawco_highlight_close = () => '</span>';
}

function markdownParser({ html = false, presentation = LEGACY_WAWCO_PRESENTATION } = {}) {
  const md = new MarkdownIt('commonmark', {
    html,
    linkify: false,
    typographer: false,
    breaks: false,
  });
  md.enable('table');
  md.use(highlightPlugin, { presentation });
  return md;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function walkTokens(tokens, visit) {
  for (const token of tokens) {
    visit(token);
    if (token.children) walkTokens(token.children, visit);
  }
}

function emptyMarkdownStructure() {
  return Object.fromEntries(MARKDOWN_STRUCTURE_KEYS.map((key) => [key, key === 'version' ? MARKDOWN_STRUCTURE_VERSION : 0]));
}

function validateMarkdownStructure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Markdown structure must be an object.');
  }
  const keys = Object.keys(value);
  if (keys.length !== MARKDOWN_STRUCTURE_KEYS.length || keys.some((key, index) => key !== MARKDOWN_STRUCTURE_KEYS[index])) {
    throw new Error('Markdown structure has missing, unknown, or noncanonical fields.');
  }
  const normalized = {};
  for (const key of MARKDOWN_STRUCTURE_KEYS) {
    const count = value[key];
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Markdown structure field ${key} must be a nonnegative safe integer.`);
    }
    normalized[key] = count;
  }
  if (normalized.version !== MARKDOWN_STRUCTURE_VERSION) {
    throw new Error(`Markdown structure uses unsupported version: ${normalized.version}`);
  }
  return normalized;
}

export function encodeMarkdownStructure(value) {
  const canonical = validateMarkdownStructure(value);
  return Buffer.from(JSON.stringify(canonical), 'utf8').toString('base64url');
}

export function decodeMarkdownStructure(value) {
  const encoded = String(value || '').trim();
  if (!encoded || encoded.length > MAX_MARKDOWN_STRUCTURE_HEADER_CHARS || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('Markdown structure header is missing, malformed, or oversized.');
  }
  const buffer = Buffer.from(encoded, 'base64url');
  if (!buffer.length || buffer.toString('base64url') !== encoded) {
    throw new Error('Markdown structure header is not canonical base64url.');
  }
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Markdown structure header does not contain valid JSON.');
  }
  const canonical = validateMarkdownStructure(parsed);
  if (JSON.stringify(canonical) !== buffer.toString('utf8')) {
    throw new Error('Markdown structure header JSON is not canonical.');
  }
  return canonical;
}

export function formatWarningsFromMarkdownStructure(structure) {
  if (!structure) return [];
  const canonical = validateMarkdownStructure(structure);
  if (!canonical.softbreakCount) return [];
  return [{
    code: 'markdown-softbreaks-render-as-spaces',
    severity: 'warning',
    count: canonical.softbreakCount,
    message: `${canonical.softbreakCount} CommonMark soft break${canonical.softbreakCount === 1 ? '' : 's'} will render as ${canonical.softbreakCount === 1 ? 'a space' : 'spaces'}. Use a blank line for a new paragraph or an explicit Markdown hard break only where a visible line break is intended.`,
  }];
}

function validateComponents(tokens, presentation = LEGACY_WAWCO_PRESENTATION) {
  const structure = emptyMarkdownStructure();
  let inTable = false;
  let inBody = false;
  let inCell = false;
  let rowCells = 0;
  let bodyRows = 0;

  walkTokens(tokens, (token) => {
    if (token.type === 'heading_open' && /^h[1-6]$/.test(token.tag)) structure[`${token.tag}Count`] += 1;
    else if (token.type === 'paragraph_open') structure.paragraphCount += 1;
    else if (token.type === 'bullet_list_open') structure.bulletListCount += 1;
    else if (token.type === 'ordered_list_open') structure.orderedListCount += 1;
    else if (token.type === 'list_item_open') structure.listItemCount += 1;
    else if (token.type === 'blockquote_open') structure.blockquoteCount += 1;
    else if (token.type === 'table_open') structure.tableCount += 1;
    else if (token.type === 'link_open') structure.linkCount += 1;
    else if (token.type === 'strong_open') structure.strongCount += 1;
    else if (token.type === 'em_open') structure.emphasisCount += 1;
    else if (token.type === 'code_inline') structure.inlineCodeCount += 1;
    else if (token.type === 'fence' || token.type === 'code_block') structure.codeBlockCount += 1;
    else if (token.type === 'hr') structure.horizontalRuleCount += 1;
    else if (token.type === 'wawco_highlight_open') structure.highlightCount += 1;
    else if (token.type === 'softbreak') structure.softbreakCount += 1;
    else if (token.type === 'hardbreak') structure.hardbreakCount += 1;
  });
  if (!presentation.components.headings && Object.entries(structure).some(([key, count]) => /^h[1-6]Count$/.test(key) && count)) throw new Error('The selected email profile does not permit headings.');
  if (!presentation.components.lists && (structure.bulletListCount || structure.orderedListCount)) throw new Error('The selected email profile does not permit lists.');
  if (!presentation.components.blockquote && structure.blockquoteCount) throw new Error('The selected email profile does not permit blockquotes.');
  if (!presentation.components.code && (structure.inlineCodeCount || structure.codeBlockCount)) throw new Error('The selected email profile does not permit code formatting.');
  const highlightLimit = Math.min(MAX_HIGHLIGHT_COUNT, presentation.components.highlights);
  if (structure.highlightCount > highlightLimit) throw new Error(`Markdown email bodies support at most ${highlightLimit} highlights for the selected profile.`);
  const tableLimit = Math.min(MAX_TABLE_COUNT, presentation.components.smallTables);
  if (structure.tableCount > tableLimit) throw new Error(`Markdown email bodies support at most ${tableLimit} data tables for the selected profile.`);

  for (const token of tokens) {
    if (token.type === 'table_open') {
      inTable = true;
      bodyRows = 0;
    } else if (token.type === 'tbody_open') {
      inBody = true;
    } else if (token.type === 'tbody_close') {
      inBody = false;
    } else if (token.type === 'tr_open' && inTable) {
      rowCells = 0;
    } else if ((token.type === 'th_open' || token.type === 'td_open') && inTable) {
      rowCells += 1;
      inCell = true;
      if (rowCells > MAX_TABLE_COLUMNS) {
        throw new Error(`Markdown data tables support at most ${MAX_TABLE_COLUMNS} columns. Use stacked key-value records for four or more fields.`);
      }
    } else if ((token.type === 'th_close' || token.type === 'td_close') && inTable) {
      inCell = false;
    } else if (token.type === 'inline' && inCell && token.content.length > MAX_TABLE_CELL_CHARS) {
      throw new Error(`Markdown data-table cells support at most ${MAX_TABLE_CELL_CHARS} characters.`);
    } else if (token.type === 'tr_close' && inTable && inBody) {
      bodyRows += 1;
      if (bodyRows > MAX_TABLE_ROWS) {
        throw new Error(`Markdown data tables support at most ${MAX_TABLE_ROWS} body rows.`);
      }
    } else if (token.type === 'table_close') {
      inTable = false;
      inBody = false;
      inCell = false;
    }
  }

  return validateMarkdownStructure(structure);
}

function assertSafeMarkdown(source, presentation = LEGACY_WAWCO_PRESENTATION) {
  const validationParser = markdownParser({ html: true, presentation });
  validationParser.validateLink = () => true;
  const tokens = validationParser.parse(String(source), {});
  walkTokens(tokens, (token) => {
    if (token.type === 'html_block' || token.type === 'html_inline') {
      throw new Error('Markdown email bodies do not permit raw HTML.');
    }
    if (token.type === 'image') {
      throw new Error('Markdown email bodies do not permit embedded images. Use the approved single inline PNG figure input instead.');
    }
    if (token.type === 'link_open') {
      const href = token.attrGet('href') || '';
      if (!SAFE_LINK_RE.test(href)) {
        throw new Error(`Markdown email link uses an unsupported URL scheme: ${href || '(empty)'}`);
      }
    }
  });
  return validateComponents(tokens, presentation);
}

function configureEmailRenderer(md, presentation = LEGACY_WAWCO_PRESENTATION) {
  const { escapeHtml } = md.utils;
  const { fonts, body, typography, spacing, colors, rules } = presentation;
  const paragraphStyle = `margin:0 0 ${spacing.paragraphAfterPx}px 0;font-family:${fonts.body};font-size:${body.sizePx}px;line-height:${body.lineHeightPx}px;mso-line-height-rule:exactly;color:${colors.text};`;
  const headingStyles = {
    h1: `margin:0 0 ${spacing.h1AfterPx}px 0;font-family:${fonts.body};font-size:${typography.h1.sizePx}px;line-height:${typography.h1.lineHeightPx}px;font-weight:${typography.h1.weight};color:${colors.text};`,
    h2: `margin:${spacing.h2BeforePx}px 0 ${spacing.h2AfterPx}px 0;font-family:${fonts.body};font-size:${typography.h2.sizePx}px;line-height:${typography.h2.lineHeightPx}px;font-weight:${typography.h2.weight};color:${colors.text};`,
    h3: `margin:${spacing.h3BeforePx}px 0 ${spacing.h3AfterPx}px 0;font-family:${fonts.body};font-size:${typography.h3.sizePx}px;line-height:${typography.h3.lineHeightPx}px;font-weight:${typography.h3.weight};color:${colors.text};`,
  };

  md.renderer.rules.paragraph_open = () => `<p style="${paragraphStyle}">`;
  md.renderer.rules.paragraph_close = () => '</p>\n';
  md.renderer.rules.heading_open = (tokens, index) => {
    const tag = tokens[index].tag;
    const style = headingStyles[tag] || headingStyles.h3;
    return `<${tag} style="${style}">`;
  };
  md.renderer.rules.heading_close = (tokens, index) => `</${tokens[index].tag}>\n`;
  md.renderer.rules.bullet_list_open = () => `<ul style="margin:0 0 ${spacing.listAfterPx}px 0;padding:0 0 0 24px;font-family:${fonts.body};font-size:${body.sizePx}px;line-height:${body.lineHeightPx}px;color:${colors.text};">\n`;
  md.renderer.rules.bullet_list_close = () => '</ul>\n';
  md.renderer.rules.ordered_list_open = (tokens, index) => {
    const start = tokens[index].attrGet('start');
    const startAttribute = start && start !== '1' ? ` start="${escapeHtml(start)}"` : '';
    return `<ol${startAttribute} style="margin:0 0 ${spacing.listAfterPx}px 0;padding:0 0 0 28px;font-family:${fonts.body};font-size:${body.sizePx}px;line-height:${body.lineHeightPx}px;color:${colors.text};">\n`;
  };
  md.renderer.rules.ordered_list_close = () => '</ol>\n';
  md.renderer.rules.list_item_open = () => '<li style="margin:0 0 8px 0;padding:0 0 0 2px;">';
  md.renderer.rules.list_item_close = () => '</li>\n';
  md.renderer.rules.strong_open = () => '<strong style="font-weight:700;">';
  md.renderer.rules.strong_close = () => '</strong>';
  md.renderer.rules.em_open = () => '<em style="font-style:italic;">';
  md.renderer.rules.em_close = () => '</em>';
  md.renderer.rules.code_inline = (tokens, index) => `<code style="font-family:${fonts.mono};font-size:${typography.inlineCode.sizePx}px;line-height:${typography.inlineCode.lineHeightPx}px;background:${colors.surfaceMuted};border-radius:${rules.inlineCodeRadiusPx}px;padding:1px 4px;color:${colors.text};">${escapeHtml(tokens[index].content)}</code>`;
  md.renderer.rules.fence = (tokens, index) => `<pre style="margin:0 0 ${spacing.listAfterPx}px 0;padding:14px 16px;background:${colors.surfaceMuted};border:1px solid ${colors.rule};border-radius:${rules.codeRadiusPx}px;font-family:${fonts.mono};font-size:${typography.codeBlock.sizePx}px;line-height:${typography.codeBlock.lineHeightPx}px;color:${colors.text};white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(tokens[index].content.replace(/\n$/, ''))}</code></pre>\n`;
  md.renderer.rules.code_block = md.renderer.rules.fence;
  md.renderer.rules.blockquote_open = () => `<blockquote style="margin:0 0 ${spacing.blockquoteAfterPx}px 0;padding:0 0 0 14px;border-left:${rules.quoteWidthPx}px solid ${colors.quoteRule};color:${colors.mutedText};font-family:${fonts.body};font-size:${body.sizePx}px;line-height:${body.lineHeightPx}px;">\n`;
  md.renderer.rules.blockquote_close = () => '</blockquote>\n';
  md.renderer.rules.hr = () => `<hr style="margin:${spacing.ruleVerticalPx}px 0;border:0;border-top:1px solid ${colors.rule};">\n`;
  md.renderer.rules.table_open = () => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 ${spacing.tableAfterPx}px 0;border-collapse:collapse;border-spacing:0;font-family:${fonts.body};font-size:${typography.table.sizePx}px;line-height:${typography.table.lineHeightPx}px;color:${colors.text};">\n`;
  md.renderer.rules.table_close = () => '</table>\n';
  md.renderer.rules.thead_open = () => '<thead>\n';
  md.renderer.rules.thead_close = () => '</thead>\n';
  md.renderer.rules.tbody_open = () => '<tbody>\n';
  md.renderer.rules.tbody_close = () => '</tbody>\n';
  md.renderer.rules.tr_open = () => '<tr>\n';
  md.renderer.rules.tr_close = () => '</tr>\n';
  md.renderer.rules.th_open = () => `<th scope="col" align="left" valign="top" style="padding:9px 8px;border-bottom:1px solid ${colors.strongRule};font-family:${fonts.body};font-size:${typography.tableHeader.sizePx}px;line-height:${typography.tableHeader.lineHeightPx}px;font-weight:${typography.tableHeader.weight};color:${colors.text};overflow-wrap:break-word;word-break:normal;">`;
  md.renderer.rules.th_close = () => '</th>\n';
  md.renderer.rules.td_open = () => `<td align="left" valign="top" style="padding:9px 8px;border-bottom:1px solid ${colors.rule};font-family:${fonts.body};font-size:${typography.table.sizePx}px;line-height:${typography.table.lineHeightPx}px;color:${colors.text};overflow-wrap:break-word;word-break:normal;">`;
  md.renderer.rules.td_close = () => '</td>\n';
  md.renderer.rules.link_open = (tokens, index) => {
    const href = tokens[index].attrGet('href');
    const title = tokens[index].attrGet('title');
    return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''} style="color:${colors.link};text-decoration:underline;">`;
  };
  md.renderer.rules.link_close = () => '</a>';
  md.renderer.rules.softbreak = () => '\n';
  md.renderer.rules.hardbreak = () => '<br>\n';
}

function renderInlinePlain(children = []) {
  let output = '';
  const links = [];
  for (const token of children) {
    if (token.type === 'text' || token.type === 'code_inline') {
      output += token.content;
    } else if (token.type === 'softbreak') {
      output += ' ';
    } else if (token.type === 'hardbreak') {
      output += '\n';
    } else if (token.type === 'link_open') {
      links.push({ href: token.attrGet('href') || '', start: output.length });
    } else if (token.type === 'link_close') {
      const link = links.pop();
      if (link) {
        const label = output.slice(link.start).trim();
        if (label !== link.href) output += ` <${link.href}>`;
      }
    }
  }
  return output;
}

function renderPlainTable(tokens, startIndex) {
  const rows = [];
  let inHead = false;
  let currentRow = null;
  let currentCell = null;
  let endIndex = startIndex;

  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    endIndex = index;
    if (token.type === 'thead_open') {
      inHead = true;
    } else if (token.type === 'thead_close') {
      inHead = false;
    } else if (token.type === 'tr_open') {
      currentRow = { header: inHead, cells: [] };
    } else if (token.type === 'th_open' || token.type === 'td_open') {
      currentCell = '';
    } else if (token.type === 'inline' && currentCell !== null) {
      currentCell += renderInlinePlain(token.children).replace(/\s+/g, ' ').trim();
    } else if (token.type === 'th_close' || token.type === 'td_close') {
      currentRow?.cells.push(currentCell || '');
      currentCell = null;
    } else if (token.type === 'tr_close' && currentRow) {
      rows.push(currentRow);
      currentRow = null;
    } else if (token.type === 'table_close') {
      break;
    }
  }

  const lines = [];
  for (const row of rows) {
    lines.push(row.cells.join(' | '));
    if (row.header) lines.push(row.cells.map(() => '---').join(' | '));
  }
  return { lines, endIndex };
}

function renderMarkdownPlainText(md, source) {
  const tokens = md.parse(source, {});
  const lines = [];
  const listStack = [];
  const itemStack = [];
  let blockquoteDepth = 0;

  function pushContent(content) {
    const contentLines = String(content).replace(/\n$/, '').split('\n');
    const item = itemStack.at(-1);
    const quotePrefix = blockquoteDepth ? `${'> '.repeat(blockquoteDepth)}` : '';
    for (let index = 0; index < contentLines.length; index += 1) {
      let itemPrefix = '';
      if (item) {
        itemPrefix = item.used ? ' '.repeat(item.prefix.length) : item.prefix;
        item.used = true;
      }
      lines.push(`${quotePrefix}${itemPrefix}${contentLines[index]}`.trimEnd());
    }
  }

  function blankLine() {
    if (lines.length && lines.at(-1) !== '') lines.push('');
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'table_open') {
      blankLine();
      const table = renderPlainTable(tokens, index);
      lines.push(...table.lines);
      index = table.endIndex;
      blankLine();
    } else if (token.type === 'bullet_list_open') {
      listStack.push({ type: 'bullet', next: 1 });
    } else if (token.type === 'ordered_list_open') {
      listStack.push({ type: 'ordered', next: Number(token.attrGet('start') || 1) });
    } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listStack.pop();
      blankLine();
    } else if (token.type === 'list_item_open') {
      const list = listStack.at(-1) || { type: 'bullet', next: 1 };
      const marker = list.type === 'ordered' ? `${list.next++}. ` : '- ';
      itemStack.push({ prefix: `${'  '.repeat(Math.max(0, listStack.length - 1))}${marker}`, used: false });
    } else if (token.type === 'list_item_close') {
      itemStack.pop();
    } else if (token.type === 'blockquote_open') {
      blockquoteDepth += 1;
    } else if (token.type === 'blockquote_close') {
      blockquoteDepth -= 1;
      blankLine();
    } else if (token.type === 'inline') {
      pushContent(renderInlinePlain(token.children));
    } else if (token.type === 'fence' || token.type === 'code_block') {
      pushContent(token.content);
      blankLine();
    } else if (token.type === 'hr') {
      pushContent('-----');
      blankLine();
    } else if (token.type === 'heading_close') {
      blankLine();
    } else if (token.type === 'paragraph_close') {
      const nextType = tokens[index + 1]?.type;
      if (nextType !== 'list_item_close') blankLine();
    }
  }

  while (lines.at(-1) === '') lines.pop();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function figureDisplayDimensions(figure, figureCaps = LEGACY_WAWCO_PRESENTATION.figureCaps) {
  const width = Number(figure?.width || 0);
  const height = Number(figure?.height || 0);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Inline figure display sizing requires positive integer dimensions.');
  }
  const ratio = width / height;
  const maximumWidth = ratio < 0.67
    ? figureCaps.tallMaxPx
    : ratio < 0.9
      ? figureCaps.portraitMaxPx
      : ratio <= 1.1
        ? figureCaps.squareMaxPx
        : figureCaps.landscapeMaxPx;
  const displayWidth = Math.min(maximumWidth, width);
  const displayHeight = Math.max(1, Math.round((height * displayWidth) / width));
  return { displayWidth, displayHeight, sizingClass: ratio < 0.67 ? 'tall' : ratio < 0.9 ? 'portrait' : ratio <= 1.1 ? 'square' : 'landscape' };
}

function renderInlineFigure(figure, index, presentation = LEGACY_WAWCO_PRESENTATION) {
  if (!figure) return { html: '', plainText: '' };
  const figureIndex = index + 1;
  const { displayWidth, displayHeight } = figureDisplayDimensions(figure, presentation.figureCaps);
  const captionRow = figure.caption
    ? [
      '  <tr>',
      `    <td data-wawco-figure-caption="v1" data-wawco-figure-index="${figureIndex}" align="left" style="padding:${presentation.spacing.captionBeforePx}px 0 0 0;font-family:${presentation.fonts.body};font-size:${presentation.typography.caption.sizePx}px;line-height:${presentation.typography.caption.lineHeightPx}px;color:${presentation.colors.mutedText};">${escapeHtml(figure.caption)}</td>`,
      '  </tr>',
    ].join('\n')
    : '';
  const html = [
    `<table role="presentation" data-wawco-inline-figure="v1" data-wawco-figure-index="${figureIndex}" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:${presentation.spacing.figureBeforePx}px 0 ${presentation.spacing.figureAfterPx}px 0;border-collapse:collapse;">`,
    '  <tr>',
    '    <td align="left" style="padding:0;">',
    `      <img src="cid:${escapeHtml(figure.cid)}" alt="${escapeHtml(figure.alt)}" width="${displayWidth}" style="display:block;width:100%;max-width:${displayWidth}px;height:auto;border:0;outline:none;text-decoration:none;">`,
    '    </td>',
    '  </tr>',
    captionRow,
    '</table>',
  ].filter(Boolean).join('\n');
  const plainText = [`[Image: ${figure.alt}]`, figure.caption].filter(Boolean).join('\n');
  return { html, plainText };
}

export function renderMarkdownEmail(source, { figures = [], figure = null, presentation = LEGACY_WAWCO_PRESENTATION } = {}) {
  const normalizedSource = String(source ?? '').replace(/\r\n|\r/g, '\n');
  const markdownStructure = assertSafeMarkdown(normalizedSource, presentation);
  const formatWarnings = formatWarningsFromMarkdownStructure(markdownStructure);
  const normalizedFigures = figures.length ? figures : figure ? [figure] : [];

  const md = markdownParser({ presentation });
  configureEmailRenderer(md, presentation);
  if (normalizedFigures.length > presentation.components.inlineFigures) throw new Error(`The selected email profile supports at most ${presentation.components.inlineFigures} inline figure(s).`);
  const renderedFigures = normalizedFigures.map((item, index) => renderInlineFigure(item, index, presentation));
  const markdownHtml = md.render(normalizedSource).trim();
  const contentHtml = [markdownHtml, ...renderedFigures.map((rendered) => rendered.html)].filter(Boolean).join('\n');
  const renderedPlainText = renderMarkdownPlainText(md, normalizedSource);
  const plainText = [renderedPlainText, ...renderedFigures.map((rendered) => rendered.plainText)].filter(Boolean).join('\n\n');
  const html = [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">',
    '  <tr>',
    '    <td align="left" style="padding:0;">',
    `      <!--[if mso]><table role="presentation" width="${presentation.measurePx}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
    `      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${presentation.measurePx}px;border-collapse:collapse;">`,
    '        <tr>',
    `          <td align="left" style="padding:0;font-family:${presentation.fonts.body};font-size:${presentation.body.sizePx}px;line-height:${presentation.body.lineHeightPx}px;color:${presentation.colors.text};">`,
    contentHtml,
    '          </td>',
    '        </tr>',
    '      </table>',
    '      <!--[if mso]></td></tr></table><![endif]-->',
    '    </td>',
    '  </tr>',
    '</table>',
  ].join('\r\n');

  return {
    html,
    plainText,
    tableCount: markdownStructure.tableCount,
    highlightCount: markdownStructure.highlightCount,
    inlineFigureCount: normalizedFigures.length,
    markdownStructure,
    formatWarnings,
  };
}
