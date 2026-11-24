# Deploy to another Fabric tenant

This runbook uses a newly generated, non-clinical fixture. The reference deployment verified the medallion pipeline, semantic model and ontology configuration. The protected app was demonstrated with synthetic data only. The Data Agent was not grounded or published.

## 1. Provision target resources

Sign into the target tenant, confirm its Entra directory and an active **Central US** Fabric capacity, and verify feature availability using [Fabric regional availability](https://learn.microsoft.com/en-us/fabric/admin/region-availability). The geographic location in Azure, not the capacity name, is authoritative. Place every solution item in **one workspace**, such as `Medical Document Ingestion - Central US`. In that workspace create a [schema-enabled Lakehouse](https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-schemas) named `medical_documents`. Record the target Lakehouse **item ID**, not the SQL endpoint ID. Create or resume capacity, change tenant settings, or assign new roles only with authorization.

In the cloned repository run `python scripts\make_synthetic_pdf.py` and upload `generated\synthetic-medical-record.pdf` to the Lakehouse `Files/raw/`. No other input is necessary. For future approved inputs, use a unique immutable path per source PDF; don't overwrite a registered file. The smoke PDF uses English headings to make its embedded text reproducible without a custom font. The parser tests separately exercise Hebrew labels, dates, and compact visit markers.

## 2. Run the two notebooks

1. Import [01-bronze-to-silver.ipynb](../notebooks/01-bronze-to-silver.ipynb) and [02-clinical-extraction.ipynb](../notebooks/02-clinical-extraction.ipynb) from **Import → Notebook** in the project workspace. In each notebook attach the target `medical_documents` as the **default** Lakehouse. Restart the Spark session after a default change. The notebooks ship without a tenant binding.
2. In each notebook's configuration cell, replace `LAKEHOUSE_ID` with the target Lakehouse GUID. Keep `SOURCE_PATH = 'Files/raw/synthetic-medical-record.pdf'` for the smoke test. Both notebooks must use the same ID and relative file path.
3. Run **01** first. It installs `pypdf==7.1.1`; use an approved Fabric Environment with the same package if the workspace blocks notebook installs. Confirm one registered PDF, one page with `text_extracted`, and the matching Silver JSON/Delta read-back. The fixture reports zero Hebrew pages by design. Image-only pages, malformed/encrypted PDFs and unusable text are not silently handed off to OCR or AI.
4. Run **02**. Keep `EXPECTED_PAGES = 1` for the fixture; for a different approved PDF, set it to the verified page count reported by **01**. The notebook locates the Bronze record for the configured path, checks Silver page coverage and exact source evidence, then writes the versioned Silver JSON and Delta candidate tables. `gold.extraction_runs` is marked checked only after validation. The seven Gold tables are `visits`, `diagnoses`, `medications`, `tests`, `treatments`, `referrals`, and `date_mentions`. Gold base tables may contain sensitive descriptions even though the analytical views omit them.
5. In a clean workspace the fixture yields **one of each of the seven categories**, including one standalone date emitted from the dated visit line. All seven rows must be `needs_review`. Rerun both notebooks to confirm counts are unchanged. Identical runs are idempotent on their row keys. Run sequentially, not concurrently against the same document. If an existing version's candidate JSON differs, stop. A changed extraction ruleset needs a new version plus an intentional update to the analytical view filters.

## 3. Publish and verify the SQL domain

Open the Lakehouse **SQL analytics endpoint**, not a Warehouse or the Spark SQL editor. Wait until it can see `gold.extraction_runs` and all seven base category tables. Run [publish-domain.sql](../sql/publish-domain.sql) in **New SQL query**. It creates or alters nine views and checks category counts and provenance. The synthetic result is seven category rows, each with count 1, distinct count 1, `missing_run = 0`, and `invalid_lineage = 0`; `dated_count` is 1 only for visits and standalone date mentions.

The shared key is SQL `SHA2_256(document_id + ':' + rule_version)` rendered as 64 hex characters. The model uses `document_id` for document-to-run lineage and this `run_key` for run-to-candidate lineage. Don't replace it with a different Spark hash or infer cross-category associations. Use the `domain_*` views for the analytical model; exclude the base tables, Silver, Bronze and any app readiness probe.

## 4. Create and validate the semantic model

1. From the SQL endpoint select **New semantic model**, target the confirmed workspace, and name it `Medical Gold`. Choose **Direct Lake on SQL** and select exactly the nine `gold.domain_*` views. View-backed tables can use DirectQuery fallback. Do not choose Direct Lake on OneLake for these views.
2. Open **Model view**. In the Power BI web editor use **Viewing → Editing** with appropriate permissions. If the switch is missing, open the target model in a fresh Power BI tab and confirm edit permission. The [TMDL view](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-tmdl-view) script assumes model table names match the SQL view names without `gold.`. Remove any auto-detected relationships that would duplicate or conflict with the eight explicit relationships, after confirming this is the new deployment. Paste [medical-lineage.tmdl](../semantic-model/medical-lineage.tmdl) into TMDL view; preview, apply, and save. Use multiline paste rather than simulated typing that changes indentation.
3. Replace the default text in **DAX query view** with [validate-medical-lineage.dax](../semantic-model/validate-medical-lineage.dax). Expected: one document, one run, one of each clinical category, six clinical candidates, one standalone date, seven total and seven needing review. Empty document/run filters must return zero downstream rows. Confirm eight active, single-direction relationships.

## 5. Generate and verify the ontology

From `Medical Gold`, choose **Generate Ontology** and create `Medical_Domain` in the same workspace. [Generation](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-generate-from-semantic-models) needs the appropriate Fabric item settings and model access. Wait for the Explorer to load. No ontology AI authoring is required.

- Set entity type keys in **View Entity Type details → Configure → Entity type key**: `domain_source_documents.document_id`, `domain_extraction_runs.run_key`, and `candidate_id` for the seven remaining types. Check that the selected properties are bound to the corresponding model columns. Reload to verify persistence.
- Verify the eight relationship configurations by opening **Manage relationships**. The extraction run maps to source document via `document_id` on both ends. Each candidate type maps to extraction run via `run_key` on both ends. Use direct property mapping, not a separate mapping-table join. The direction is child → parent in the ontology's generated relationship names, not Power BI's filter direction.
- Verify all ten metrics link to the target `Medical Gold` (three on extraction runs; one per candidate type). This is metadata and binding validation, not proof of graph-node/edge materialization. A [materialized graph](https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-use-ontology-graph) is optional and not necessary for this baseline.

## 6. Deploy the protected clinician demo

Requires Node.js (the reference used 24.11.1), a capacity and region that support [Fabric Apps](https://learn.microsoft.com/en-us/fabric/apps/overview), and deploy rights in the target tenant. Use the same workspace as the Lakehouse, even though the demo has no data connector. The repository includes an explicit Rayfin configuration pinned to the reference tooling, with protected hosting and Fabric sign-in. If the preview CLI version is no longer available, use Microsoft's [current scaffold and CLI guide](https://learn.microsoft.com/en-us/fabric/apps/create-app-with-cli) in a separate scratch directory. Move the demo page into the scaffold's frontend and preserve protected hosting with all data connectors and writes disabled.

```powershell
Set-Location app
npm ci
npm run build
npx rayfin login --tenant "<target-tenant-guid>"
npx rayfin up --help
npx rayfin up --tenant "<target-tenant-guid>" --workspace-id "<target-workspace-guid>" --item-name "Clinical Review 360" --dry-run
npx rayfin up --tenant "<target-tenant-guid>" --workspace-id "<target-workspace-guid>" --item-name "Clinical Review 360"
npx rayfin up status
```

Confirm the current CLI recognizes explicit workspace targeting and use its tenant selector if offered (the deployed CLI version may differ). Verify account, tenant and target workspace ID even if the workspace name is unique; abort on mismatch. Use the hosted URL printed by the CLI. Configure only verified target redirect URIs if needed. No production redirect URL, `.env`, or deployment registry is supplied.

Test a signed-out request cannot retrieve the page, then use an approved signed-in reviewer to test synthetic visit filtering, correction and separate `related` / `unrelated` / `maybe` decisions. Refresh and verify that edits disappear. The Gold SQL endpoint is read-only for Delta data; it is not a decision-writeback store. In the reference deployment, the delegated SQL source was discoverable but returned HTTP 400 `Source attachment failed` when attaching; it is intentionally excluded from the deployable configuration. Do not infer this rules out every cross-region topology. Diagnose attachment and authorization separately before a live rollout.

## 7. Create the Data Agent draft

In the target workspace choose **New item → Data agent**, name it `Medical Gold Data Agent`, and close the data source picker. Leave it unpublished. This reproduces the reference state. In the reference tenant the instructions control was disabled until a source was added.

If separately approved for **synthetic data**, use [ontology sources](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-ontology-sources) with the verified target ontology and its underlying semantic model. Start with this one route; don't attach a duplicate model source without proving the need. Paste [bilingual instructions](../data-agent/instructions.txt) into **Setup → Agent instructions** once enabled. Validate as intended caller identities: English and Hebrew count questions should return the fixture totals; a question about whether something relates to **פעולות איבה** should say the model has no clinician decision; record-level questions must not be answered. Enforce data access at the source, not via these instructions.

Before any AI test or attachment with real data, check the [Fabric Data Agent tenant settings](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-tenant-settings) and your target tenant's policy. Processing and stored conversation history may leave the capacity region; Microsoft documents cross-region switches for capacities outside the US/EU boundary and retention of up to 28 days. Keep the agent disconnected if those paths are not approved.

## 8. Deploy PDF Data Uploader

Follow the [uploader runbook](uploader.md). It uses the Central US regional OneLake endpoint, the target Lakehouse, and a server-side allowlist. It does not write into the original deployment or start extraction. For one uploaded synthetic file, copy its exact reported `Files/raw/...` path into both notebooks as `SOURCE_PATH`. Because the uploader verification fixture is identical across retries, choose **one** copy to process; Bronze deduplicates by PDF bytes and rejects registering the same bytes under a different path.

## Operational checks

- Report any feature as not deployed or unverified when its gate is unmet. Keep preview deployment and AI approval separate from core analytics readiness.
- Use a dedicated test workspace for smoke checks. Keep deployment item links and aggregate validation evidence privately. If cleanup is approved, remove only newly created test assets in reverse dependency order; don't touch shared capacity or delete existing data, permissions, or workspaces.
