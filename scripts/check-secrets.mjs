#!/usr/bin/env node
// Post-build guard: fail if anything secret-looking made it into the client bundle.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const RULES = [
  [/service_role/i, 'Supabase service_role reference'],
  [/SUPABASE_SERVICE_ROLE_KEY/, 'service role env name'],
  [/postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/i, 'database connection string with credentials'],
  [/sk_(?:live|test)_[0-9a-zA-Z]{16,}/, 'Stripe secret key'],
  [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, 'private key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk(DIST);

const problems = [];
for (const f of files.filter((f) => /\.(js|mjs|html|css|json|map)$/.test(f))) {
  const text = readFileSync(f, 'utf8');
  for (const [re, what] of RULES) if (re.test(text)) problems.push(`${f}: ${what}`);
  for (const m of text.matchAll(JWT)) {
    try {
      const role = JSON.parse(Buffer.from(m[1], 'base64url').toString()).role;
      if (role && role !== 'anon') problems.push(`${f}: JWT with role "${role}"`);
    } catch { /* not a JWT */ }
  }
}
if (problems.length) {
  console.error('✗ Secret scan failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`✓ Secret scan: ${files.length} files in ${DIST}/ clean`);
