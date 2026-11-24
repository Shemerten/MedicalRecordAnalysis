import { createHash, randomUUID } from 'node:crypto';

const endpoint = 'https://centralus-onelake.dfs.fabric.microsoft.com';
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const rawPath = 'Files/raw';
export const MAX_BYTES = 2 * 1024 * 1024;
const maxEncoded = 4 * Math.ceil(MAX_BYTES / 3);

export type Target = {
  workspaceId: string;
  lakehouseId: string;
  allowedUserIds: readonly string[];
  fixtureSha256: string;
};

export type UploadResult = { status: 'stored'; path: string; bytes: number }
  | { status: 'denied' | 'invalid_pdf' | 'unavailable' | 'storage_error' };

function isConfigured(target: Target | undefined): target is Target {
  return Boolean(target && guid.test(target.workspaceId) && guid.test(target.lakehouseId)
    && /^[a-f0-9]{64}$/.test(target.fixtureSha256));
}

function decodeFixture(encoded: string, expectedDigest: string): Buffer | undefined {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > maxEncoded ||
      encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > MAX_BYTES || bytes.toString('base64') !== encoded ||
      !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
      !/%%EOF\s*$/.test(bytes.subarray(-128).toString('ascii'))) return;
  if (createHash('sha256').update(bytes).digest('hex') !== expectedDigest) return;
  return bytes;
}

class StorageError extends Error {
  constructor(readonly phase: string, readonly status: number) {
    super('OneLake did not confirm the requested operation.');
  }
}

export async function uploadPdf(
  target: Target | undefined,
  callerId: string | undefined,
  encoded: string,
  storageToken: () => string,
  request: typeof fetch = fetch,
): Promise<UploadResult> {
  if (!isConfigured(target)) return { status: 'unavailable' };
  if (!callerId || !target.allowedUserIds.includes(callerId)) return { status: 'denied' };
  const data = decodeFixture(encoded, target.fixtureSha256);
  if (!data) return { status: 'invalid_pdf' };

  const base = `/${target.workspaceId}/${target.lakehouseId}`;
  const name = `${randomUUID()}.pdf`;
  const staging = `${base}/Files/_pdf_uploader_pending/${name}`;
  const finalPath = `${base}/${rawPath}/${name}`;
  let created = false;
  let token: string;
  try {
    token = storageToken();
  } catch {
    console.warn('PDF Data Uploader: OneLake storage audience is unavailable.');
    return { status: 'unavailable' };
  }
  const headers = { Authorization: `Bearer ${token}`, 'x-ms-version': '2021-06-08' };
  async function send(path: string, phase: string, expected: number, options: RequestInit) {
    const response = await request(endpoint + path, {
      ...options,
      headers: { ...headers, ...options.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== expected) {
      await response.body?.cancel();
      throw new StorageError(phase, response.status);
    }
    return response;
  }
  try {
    await send(`${staging}?resource=file`, 'create staging', 201, {
      method: 'PUT', headers: { 'If-None-Match': '*', 'x-ms-content-type': 'application/pdf' },
    });
    created = true;
    await send(`${staging}?action=append&position=0`, 'append', 202, {
      method: 'PATCH', body: new Uint8Array(data), headers: { 'Content-Type': 'application/octet-stream' },
    });
    await send(`${staging}?action=flush&position=${data.length}&close=true`, 'flush', 200, {
      method: 'PATCH', headers: { 'x-ms-content-type': 'application/pdf' },
    });
    const staged = await send(staging, 'verify staging', 200, { method: 'HEAD' });
    if (staged.headers.get('content-length') !== String(data.length)) throw new StorageError('staging length', 200);
    await send(`${finalPath}?mode=legacy`, 'publish', 201, {
      method: 'PUT', headers: { 'If-None-Match': '*', 'x-ms-rename-source': staging },
    });
    created = false;
    const stored = await send(finalPath, 'verify stored file', 200, { method: 'HEAD' });
    if (stored.headers.get('content-length') !== String(data.length)) throw new StorageError('stored length', 200);
    return { status: 'stored', path: `${rawPath}/${name}`, bytes: data.length };
  } catch (error) {
    if (error instanceof StorageError) {
      console.warn('PDF Data Uploader: OneLake request failed.', { phase: error.phase, status: error.status });
    } else {
      console.warn('PDF Data Uploader: OneLake transport did not complete.');
    }
    if (created) {
      try {
        await send(staging, 'cleanup staging', 200, { method: 'DELETE' });
      } catch {
        console.warn('PDF Data Uploader: staging cleanup was not confirmed.');
      }
    }
    return { status: 'storage_error' };
  }
}
