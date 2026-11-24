import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { MAX_BYTES, uploadPdf } from '../rayfin/functions/dist/src/upload.js';

const pdf = Buffer.from('%PDF-1.4\n% synthetic fixture bytes\n%%EOF\n');
const target = {
  workspaceId: '01234567' + '-89ab-cdef-0123-456789abcdef',
  lakehouseId: 'abcdef01' + '-2345-6789-abcd-ef0123456789',
  allowedUserIds: ['operator'],
  fixtureSha256: createHash('sha256').update(pdf).digest('hex'),
};
const input = pdf.toString('base64');
const noToken = () => assert.fail('A rejected request must not fetch a storage token');
const noRequest = () => assert.fail('A rejected request must not reach OneLake');

test('default, denied caller, other PDF, invalid encoding and oversized payload fail before storage', async () => {
  assert.equal((await uploadPdf(undefined, 'operator', input, noToken, noRequest)).status, 'unavailable');
  assert.equal((await uploadPdf(target, '', input, noToken, noRequest)).status, 'denied');
  assert.equal((await uploadPdf(target, 'viewer', input, noToken, noRequest)).status, 'denied');
  for (const invalid of ['not-base64!', Buffer.from('%PDF-1.4\n% different\n%%EOF').toString('base64'),
    Buffer.alloc(MAX_BYTES + 1).toString('base64')]) {
    assert.equal((await uploadPdf(target, 'operator', invalid, noToken, noRequest)).status, 'invalid_pdf');
  }
});

test('commits exact bytes once under a generated raw name and verifies the result', async () => {
  const calls = [];
  const statuses = [201, 202, 200, 200, 201, 200];
  const request = async (url, opts) => {
    calls.push([new URL(url), opts]);
    return new Response(null, { status: statuses.shift(), headers: { 'Content-Length': String(pdf.length) } });
  };
  const result = await uploadPdf(target, 'operator', input, () => 'test-token', request);
  assert.equal(result.status, 'stored');
  assert.equal(result.bytes, pdf.length);
  assert.match(result.path, /^Files\/raw\/[a-f0-9-]{36}\.pdf$/);
  assert.deepEqual(calls.map(([, opts]) => opts.method), ['PUT', 'PATCH', 'PATCH', 'HEAD', 'PUT', 'HEAD']);
  assert(calls.every(([url, opts]) => url.hostname === 'centralus-onelake.dfs.fabric.microsoft.com' && opts.redirect === 'error'));
  const staged = calls[0][0].pathname;
  assert.match(staged, /\/Files\/_pdf_uploader_pending\/[a-f0-9-]{36}\.pdf$/);
  assert(Buffer.from(calls[1][1].body).equals(pdf));
  assert.equal(calls[1][0].searchParams.get('position'), '0');
  assert.equal(calls[2][0].searchParams.get('position'), String(pdf.length));
  assert.equal(calls[4][1].headers['x-ms-rename-source'], staged);
  assert.equal(calls[4][1].headers['If-None-Match'], '*');
  assert.equal(calls[5][0].pathname, `/${target.workspaceId}/${target.lakehouseId}/${result.path}`);
});

test('append denial cleans only the staged object and never reports success', async () => {
  const calls = [];
  const statuses = [201, 403, 200];
  const failed = await uploadPdf(target, 'operator', input, () => 'test-token', async (url, opts) => {
    calls.push([new URL(url), opts.method]);
    return new Response(null, { status: statuses.shift() });
  });
  assert.equal(failed.status, 'storage_error');
  assert.deepEqual(calls.map(([, m]) => m), ['PUT', 'PATCH', 'DELETE']);
  assert.equal(calls[2][0].pathname, calls[0][0].pathname);
  assert(calls.every(([url]) => url.pathname.includes('/Files/_pdf_uploader_pending/')));
});
