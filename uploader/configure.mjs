import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [workspaceId, lakehouseId, ...allowedUserIds] = process.argv.slice(2);
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
if (!guid.test(workspaceId ?? '') || !guid.test(lakehouseId ?? '') ||
    allowedUserIds.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
  throw new Error('Usage: node configure.mjs WORKSPACE_GUID LAKEHOUSE_GUID [RAYFIN_USER_ID ...]');
}

const fixture = readFileSync(new URL('../generated/synthetic-medical-record.pdf', import.meta.url));
const target = {
  workspaceId: workspaceId.toLowerCase(),
  lakehouseId: lakehouseId.toLowerCase(),
  allowedUserIds: [...new Set(allowedUserIds)],
  fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
};
writeFileSync(new URL('./rayfin/functions/src/target.generated.ts', import.meta.url),
  `export const localTarget = ${JSON.stringify(target, null, 2)};\n`);
console.log(`Central US synthetic-only target configured for ${target.allowedUserIds.length} user(s).`);
