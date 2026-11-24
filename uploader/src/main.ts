import { browserSession } from '@microsoft/rayfin-auth';
import { ensureSignedInWithFabric } from '@microsoft/rayfin-auth-provider-fabric';
import { RayfinClient, resolveRayfinConfig } from '@microsoft/rayfin-client';
import { functionsService } from '@microsoft/rayfin-functions';

type UploadFunctions = {
  uploaderPolicy: { input: void; output: unknown };
  storeSyntheticPdf: { input: { pdfBase64: string }; output: unknown };
};

function required<T extends HTMLElement>(id: string, type: { new(): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing app control: ${id}`);
  return element;
}

const signIn = required('sign-in', HTMLButtonElement);
const files = required('files', HTMLInputElement);
const upload = required('upload', HTMLButtonElement);
const form = required('upload-form', HTMLFormElement);
const access = required('access', HTMLParagraphElement);
const identity = required('identity', HTMLDetailsElement);
const identityValue = required('identity-value', HTMLElement);
const progress = required('progress', HTMLParagraphElement);
const results = required('results', HTMLUListElement);

function encode(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const delimiter = reader.result.indexOf(',');
        if (delimiter !== -1) return resolve(reader.result.slice(delimiter + 1));
      }
      reject(new Error('Invalid local PDF read result.'));
    };
    reader.onerror = reader.onabort = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function decodeOutput(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function statusMessage(value: unknown) {
  const payload = decodeOutput(value);
  if (!payload || typeof payload !== 'object' || !('status' in payload)) {
    throw new Error('Unexpected upload response.');
  }
  switch (payload.status) {
    case 'stored':
      if ('path' in payload && typeof payload.path === 'string' &&
          /^Files\/raw\/[a-f0-9-]{36}\.pdf$/.test(payload.path)) return { saved: true, text: `Stored: ${payload.path}` };
      throw new Error('The saved file path is missing.');
    case 'invalid_pdf': return { saved: false, text: 'Not accepted. Select the generated synthetic fixture.' };
    case 'denied': return { saved: false, text: 'No upload grant for this account.' };
    case 'unavailable': return { saved: false, text: 'The uploader or storage connection is not configured.' };
    case 'storage_error': return { saved: false, text: 'Storage could not be confirmed. Ask an operator to check OneLake before retrying.' };
    default: throw new Error('Unexpected upload status.');
  }
}

async function initialize() {
  const config = await resolveRayfinConfig({
    apiUrl: import.meta.env.VITE_RAYFIN_API_URL,
    publishableKey: import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY,
    workspaceId: import.meta.env.VITE_FABRIC_WORKSPACE_ID,
    itemId: import.meta.env.VITE_FABRIC_ITEM_ID,
    portalUrl: import.meta.env.VITE_FABRIC_PORTAL_URL,
  });
  const { workspaceId, itemId, portalUrl } = config.runtimeConfig;
  if (!config.baseUrl || !config.publishableKey || !workspaceId || !itemId || !portalUrl) {
    access.textContent = 'This site is not connected to a deployed Fabric App. Upload is disabled.';
    return;
  }
  const client = RayfinClient.create({
    baseUrl: config.baseUrl,
    publishableKey: config.publishableKey,
    runtimeConfig: config.runtimeConfig,
    auth: browserSession({ storage: false }),
    services: { functions: functionsService<UploadFunctions>() },
  });
  let allowedDigest: string | null = null;
  signIn.disabled = false;
  access.textContent = 'Sign in to verify your uploader access.';
  signIn.addEventListener('click', async () => {
    signIn.disabled = true;
    access.textContent = 'Signing in…';
    try {
      const session = await ensureSignedInWithFabric(client.auth, {
        workspaceId,
        projectId: itemId,
        fabricPortalUrl: portalUrl,
        returnOrigin: window.location.origin,
      });
      if (!session.isAuthenticated) throw new Error('Sign-in did not establish a session.');
      const state = decodeOutput(await client.functions.uploaderPolicy.invoke());
      if (!state || typeof state !== 'object' || !('id' in state) || typeof state.id !== 'string' || !state.id) {
        throw new Error('Could not verify the current user.');
      }
      identityValue.textContent = state.id;
      identity.hidden = false;
      if (!('fixtureSha256' in state) || typeof state.fixtureSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(state.fixtureSha256)) {
        access.textContent = 'Signed in, but this account has no upload grant. Share your uploader ID privately with the deployment operator.';
        return;
      }
      allowedDigest = state.fixtureSha256;
      files.disabled = false;
      upload.disabled = false;
      access.textContent = 'Signed in and authorized for the synthetic test.';
    } catch {
      access.textContent = 'Could not verify Fabric access. Check sign-in and the deployed app permissions.';
      signIn.disabled = false;
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!allowedDigest || upload.disabled) return;
    const batch = Array.from(files.files ?? []);
    results.replaceChildren();
    if (!batch.length || batch.length > 10) {
      progress.textContent = 'Select between 1 and 10 PDFs.';
      return;
    }
    upload.disabled = files.disabled = true;
    let stored = 0;
    try {
      for (const [i, file] of batch.entries()) {
        progress.textContent = `Checking file ${i + 1} of ${batch.length}…`;
        const result = document.createElement('li');
        results.append(result);
        if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 2 * 1024 * 1024) {
          result.textContent = `File ${i + 1}: select a nonempty PDF up to 2 MiB.`;
          continue;
        }
        try {
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
          if (Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('') !== allowedDigest) {
            result.textContent = `File ${i + 1}: not the generated test PDF. Nothing was sent.`;
            continue;
          }
          const value = await client.functions.storeSyntheticPdf.invoke({ pdfBase64: await encode(file) }, { timeoutMs: 180_000 });
          const outcome = statusMessage(value);
          if (outcome.saved) stored++;
          result.textContent = `File ${i + 1}: ${outcome.text}`;
        } catch {
          result.textContent = `File ${i + 1}: upload not confirmed. Verify access and check OneLake before retrying.`;
        }
      }
      progress.textContent = `Confirmed ${stored} of ${batch.length} files in OneLake.`;
    } finally {
      files.value = '';
      upload.disabled = files.disabled = false;
    }
  });
}

void initialize().catch(() => {
  access.textContent = 'Could not load the Fabric App configuration. Upload is disabled.';
});
