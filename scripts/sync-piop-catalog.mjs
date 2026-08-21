#!/usr/bin/env node
import { readAuthoritativeCatalog } from './piop-catalog-authority.mjs';

try {
  readAuthoritativeCatalog();
} catch (error) {
  console.error(`RETIRED: ${error.message}`);
  process.exit(1);
}
