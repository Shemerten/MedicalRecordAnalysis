const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const dist = join(__dirname, 'dist');
mkdirSync(dist, { recursive: true });
copyFileSync(join(__dirname, 'public', 'index.html'), join(dist, 'index.html'));
