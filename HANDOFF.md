# Deployment handoff: Fabric Medical Records

**For the receiving deployment agent:** Recreate this solution in a **single Fabric workspace on a Central US capacity**, starting with synthetic data. A new Entra tenant is supported but not required; always confirm which tenant is the destination. This repository is a deployment template, not a backup or migration. Do not copy the original PDF, reuse resource identities or credentials, or connect the Central US solution back to the existing Israel Central Lakehouse.

## Get these inputs before touching Fabric

- Confirm target Entra tenant, subscription (if checking capacity in Azure), the active Fabric capacity/name/SKU and actual **Central US** region, workspace name, and budget. All solution items must share that workspace. Use interactive sign-in/MFA or an approved workload identity; do not ask for passwords in chat. Verify the signed-in directory in both Fabric and Rayfin before writes. Do not start a paused capacity without approval.
- Confirm target-side support for schema-enabled Lakehouse, Spark and the SQL endpoint, Power BI semantic-model web editing, and Fabric IQ ontology. Fabric Apps and Fabric Data Agent are optional preview workloads with their own regional, capacity and tenant requirements. Do not turn on administrative switches or provision paid resources without approval.
- Confirm the approved test data and allowed storage/processing locations. Default to the synthetic fixture. Separate approval is required for real medical data, app data access/writeback, and Data Agent processing and conversation storage. Do not assume approval from another tenant or workload carries over.

## Deployment order and evidence

| Step | Assets / action | Pass criteria |
|---|---|---|
| 1. Workspace and storage | Reuse the designated workspace or create one if the receiving tenant has no target yet. Create a **schema-enabled** `medical_documents` Lakehouse there. Generate the fixture per the [runbook](docs/deploy.md). Upload only that file to `Files/raw/`. | Confirm target tenant, workspace/capacity region, Lakehouse ID and file presence. |
| 2. Bronze and Silver | Import [01-bronze-to-silver.ipynb](notebooks/01-bronze-to-silver.ipynb), attach the target Lakehouse as default, set the Lakehouse ID and input path, and run in PySpark. | One Bronze manifest, one Silver page and matching page JSON for the fixture. The PDF remains unchanged. |
| 3. Clinical extraction and Gold | Import [02-clinical-extraction.ipynb](notebooks/02-clinical-extraction.ipynb), attach the same default Lakehouse and use the same ID/path. Run synthetic parser checks and then the job cells. | Seven category tables, versioned candidate JSON, and a checked run; for the fixture: seven candidates, all `needs_review`. Rerunning the same fixture does not add rows. |
| 4. SQL and Power BI | On the Lakehouse **SQL analytics endpoint**, run [publish-domain.sql](sql/publish-domain.sql). Create `Medical Gold` from the nine `gold.domain_*` views using **Direct Lake on SQL**. Apply [medical-lineage.tmdl](semantic-model/medical-lineage.tmdl) and run [validate-medical-lineage.dax](semantic-model/validate-medical-lineage.dax). | Eight relationships, ten measures, six clinical candidates + one standalone date = seven needing review; empty document/run filters return no children. |
| 5. Ontology | From the model ribbon, generate `Medical_Domain`. Follow the [key and relationship checklist](docs/deploy.md#5-generate-and-verify-the-ontology). | Nine persisted keys and bound properties, eight provenance mappings, ten metrics pointing to the target semantic model. An optional materialized graph is not part of the baseline. |
| 6. App demo | If available and approved, deploy the [protected Rayfin app](docs/deploy.md#6-deploy-the-protected-clinician-demo) with synthetic, hard-coded data. No live connector or writeback. | Signed-in reviewer can exercise RTL workflow, a signed-out request cannot obtain the app, and reload clears demo edits. |
| 7. Data Agent | Create `Medical Gold Data Agent` as an unpublished draft if supported. Leave it ungrounded by default. [Synthetic evaluation](docs/deploy.md#7-create-the-data-agent-draft) is a separate approved step. | Draft exists, with no sources by default. If synthetic evaluation is separately approved, verify ontology-to-model routing and Hebrew answers before any publication decision. |
| 8. PDF Data Uploader | Deploy the [protected uploader](docs/uploader.md) in the same workspace and bind it exclusively to the new `medical_documents` Lakehouse. | One-file and multi-file upload tests show exact fixture bytes in `Files/raw/`; an unapproved caller and a non-fixture PDF are rejected. No live data or automatic notebook runs. |

Use the [deployment runbook](docs/deploy.md) for exact commands, UI steps and expected results. If a capability is unavailable or validation fails, capture the step, sanitized error and activity ID privately; don't switch tenants, regions, permissions, or source types to bypass it.

The original deployment is a reference, not proof of a completed Central US cutover. Use the [deployment status](docs/deployment-status.md) to distinguish verified local checks from target-tenant work that must still be carried out.

## Boundaries and remaining work

- The ontology represents **source document → extraction run → candidate categories**. Document IDs are not patient IDs. Don't join candidates to visits by page, line, date or co-occurrence. Standalone dates are not dates of hostile acts. Nothing in Gold validates a diagnosis or establishes a relationship to **פעולות איבה**.
- The reference app accepted authenticated users and displayed synthetic data. Its live source attachment failed; no durable decisions or clinician grants were enabled. A live rollout requires case-level authorization enforced on the server, delegated reads, an auditable writable decision store separate from extracted Gold, and access tests with authorized and unauthorized clinician identities. Clinical validation/correction and incident relatedness must remain separate decisions.
- The reference Data Agent was an empty draft. Its instruction editor was disabled without a source; [bilingual instructions](data-agent/instructions.txt) are a template, not active policy. Check the target region's Azure OpenAI processing and conversation storage rules before connecting or testing a source. Instructions are not a security boundary.

## What to return to the rollout owner

In the approved internal channel, record the deployment revision, auth/region confirmation and clickable target item links, each step's pass/fail/skipped status with aggregate evidence, any preview or permissions blockers, and what remains synthetic vs live. Keep IDs, logs and deployment state out of the repository. Never attach medical samples, extracts, credentials or screenshots of records.
