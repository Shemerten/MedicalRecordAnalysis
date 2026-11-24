# PDF Data Uploader (synthetic pilot)

The protected Fabric App selects one or more files (up to 10 at a time, 2 MiB each). It checks each file in the browser and submits it separately to a TypeScript Fabric Function. The Function checks the authenticated Rayfin user ID and the exact locally generated fixture digest before acquiring the `Storage` token. It sends bytes to the [Central US regional OneLake DFS endpoint](https://learn.microsoft.com/en-us/fabric/onelake/onelake-access-api#data-residency), stages in `Files/_pdf_uploader_pending`, verifies length, renames without overwrite, and verifies the published file in `medical_documents / Files/raw`. The UI reports each result separately.

## Configure and deploy

1. Use the tenant/workspace/capacity from [the deployment runbook](deploy.md). Confirm `medical_documents` is a Lakehouse in that workspace and create the `raw` and `_pdf_uploader_pending` folders under `Files` in Lakehouse Explorer. Keep staging out of notebook input paths. This app deliberately cannot target another region.
2. Deploy using an approved app owner with only the required Central US Lakehouse permissions. [Functions call external resources as the app identity](https://learn.microsoft.com/en-us/fabric/apps/functions-connect-external-resources), currently the app owner; the uploader server allowlist is separate from the ability to open the protected app. Do not use a tenant-wide administrator as a production app owner. Do not share workspace admin access with uploaders.
3. Generate `generated\synthetic-medical-record.pdf` using `python scripts\make_synthetic_pdf.py` from the repo root. If it already exists and is the unchanged generated fixture, reuse it. Then run the commands below from `uploader`.

```powershell
npm ci
npm test
npm run build
node configure.mjs "<workspace-guid>" "<lakehouse-item-guid>"
npx rayfin login --tenant "<tenant-guid>"
npx rayfin up --tenant "<tenant-guid>" --workspace-id "<workspace-guid>" --item-name "PDF Data Uploader" --dry-run
npx rayfin up --tenant "<tenant-guid>" --workspace-id "<workspace-guid>" --item-name "PDF Data Uploader"
npx rayfin up status
```

The first deployment has **no write grants**. Open the protected app as the approved test user and use **Sign in with Fabric → My uploader ID**. Record that account's ID privately; don't put it in a repo issue or commit. Add the ID by rerunning `node configure.mjs "<workspace-guid>" "<lakehouse-item-guid>" "<approved-rayfin-user-id>"`, then redeploy to the same item. Additional approved IDs may be supplied as separate arguments. The generated target file, Rayfin deployment state and PDFs are ignored by Git.

## Acceptance tests in Fabric

- Signed-out requests cannot open the protected app or invoke Functions. A signed-in, unlisted user cannot upload (also test the backend as that user, not just the disabled form).
- Choose the generated synthetic fixture, then retry with two locally renamed copies in one batch. Only the exact fixture digest is allowed; names are not transmitted to Functions. Confirm each success has its own `Files/raw/<uuid>.pdf`. Verify file size and SHA-256 against the fixture with approved OneLake access; no staged object should remain from successful uploads.
- Select a different **synthetic** PDF; it must not be sent by the standard UI and the Function must reject it when tested directly as an authorized test caller. Inspect sanitized metadata only.
- Confirm OneLake runtime support for the conditional rename and `HEAD` operations. Do not weaken the no-overwrite check or write directly into `raw` to work around an unsupported operation. A network failure after a possible publish is reported as unconfirmed, not successful; inspect the target before retrying.

The app does not upload to GitHub or schedule ingestion. It does not accept real medical records. Before a live intake implementation, separately approve Central US processing for medical data, strengthen file inspection and malware scanning, review payload logging/retention, set quotas and app ownership, and test controls using authorized and unauthorized identities.
