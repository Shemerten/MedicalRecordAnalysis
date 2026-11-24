import { writeFileSync } from 'node:fs';

try {
  writeFileSync(new URL('./rayfin/functions/src/target.generated.ts', import.meta.url),
    'export const localTarget = undefined;\n', { flag: 'wx' });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
