const registry = require('../data/registry.json');
const currentness = require('../data/currentness.json');

const EDITABLE_FIELDS = ['category', 'lifecycle', 'status'];

const ALLOWED_VALUES = {
  category: ['homepage', 'page', 'proposal', 'brief', 'tool', 'subdomain', 'internal', 'project', 'compliance'],
  lifecycle: ['active', 'archived', 'decommissioned'],
  status: ['active', 'live', 'needs_review', 'transfer_pending', 'build_pending', 'legacy', 'blocked'],
};

const ITEM_BY_ID = new Map(registry.items.map((item) => [item.id, item]));

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function pickOverrideFields(value = {}) {
  return EDITABLE_FIELDS.reduce((picked, field) => {
    if (value[field] !== undefined && value[field] !== null && value[field] !== '') {
      picked[field] = value[field];
    }
    return picked;
  }, {});
}

function overrideCount(overrides = {}) {
  return Object.values(overrides).filter((override) => Object.keys(pickOverrideFields(override)).length > 0).length;
}

function applyOverridesToItems(items, overrides = {}) {
  return items.map((item) => {
    const override = pickOverrideFields(overrides[item.id] || {});
    return Object.keys(override).length ? { ...item, ...override } : item;
  });
}

function registryPayload(overrides = {}, options = {}) {
  return {
    ok: true,
    version: registry.version,
    generatedAt: registry.generatedAt,
    source: registry.source,
    items: applyOverridesToItems(registry.items, overrides),
    currentness,
    overrideCount: overrideCount(overrides),
    persistence: options.persistence || { configured: false },
    ...(Number.isFinite(options.appliedChangeCount) ? { appliedChangeCount: options.appliedChangeCount } : {}),
  };
}

function normalizeOverrideChanges(changes) {
  if (!Array.isArray(changes)) {
    throw httpError(400, 'Expected changes to be an array.');
  }
  if (changes.length > 200) {
    throw httpError(413, 'Too many changes in one request.');
  }

  const byId = new Map();

  changes.forEach((change, index) => {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      throw httpError(400, `Change ${index + 1} must be an object.`);
    }

    const id = String(change.id || '').trim();
    const baseItem = ITEM_BY_ID.get(id);
    if (!baseItem) {
      throw httpError(400, `Unknown Windex item id: ${id || '(empty)'}.`);
    }

    const to = change.to;
    if (!to || typeof to !== 'object' || Array.isArray(to)) {
      throw httpError(400, `Change for ${id} must include a to object.`);
    }

    const fields = Object.keys(to);
    if (!fields.length) {
      throw httpError(400, `Change for ${id} does not include any fields.`);
    }

    const normalized = byId.get(id) || { id, fields: {} };

    fields.forEach((field) => {
      if (!EDITABLE_FIELDS.includes(field)) {
        throw httpError(400, `Field ${field} is not writable.`);
      }
      const value = to[field];
      if (typeof value !== 'string' || !ALLOWED_VALUES[field].includes(value)) {
        throw httpError(400, `Invalid ${field} for ${id}.`);
      }
      normalized.fields[field] = value === baseItem[field] ? null : value;
    });

    byId.set(id, normalized);
  });

  return Array.from(byId.values()).filter((change) => Object.keys(change.fields).length > 0);
}

module.exports = {
  registry,
  EDITABLE_FIELDS,
  ALLOWED_VALUES,
  pickOverrideFields,
  applyOverridesToItems,
  registryPayload,
  normalizeOverrideChanges,
};
