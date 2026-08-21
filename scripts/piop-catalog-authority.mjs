export const PIOP_CATALOG_AUTHORITY = Object.freeze({
  status: 'retired',
  retiredOn: '2026-08-21',
  replacement: 'graph-driven recipient-bundle selection',
});

export function readAuthoritativeCatalog() {
  throw new Error('standalone PiOp Skills Library catalog retired; use the accepted skill graph and reviewed recipient-bundle selection');
}
