# Medical Record Analysis on Microsoft Fabric

This deployment blueprint turns Hebrew medical PDFs into reviewable clinical candidates, with source evidence retained in OneLake. It provides the ingestion notebooks, analytics model, and synthetic app pilots needed to reproduce the solution in **one Microsoft Fabric workspace on an existing Central US capacity**, without transferring source-tenant data, settings, or credentials.

Start with the [deployment runbook](docs/deploy.md) for exact steps, or give [HANDOFF.md](HANDOFF.md) to a deployment agent. This is a staged rollout with manual Fabric steps, not a one-click tenant migration.

## Architecture

| Layer | What it does |
|---|---|
| Intake | **PDF Data Uploader** is a protected multi-file pilot. It accepts only the generated synthetic fixture and targets `medical_documents/Files/raw` in OneLake. An upload does not trigger extraction. |
| Bronze | OneLake preserves the original PDF; `bronze.pdf_documents` registers it by SHA-256. |
| Silver | PySpark reads embedded text with `pypdf` and applies deterministic extraction rules. Page JSON and versioned candidate JSON retain source page and line evidence. Delta tables track the extracted records. No OCR or external AI service is used. |
| Gold | Typed Delta tables store visit candidates and mentions of diagnoses, medications, tests, treatments, referrals, and dates. Nine narrow SQL views feed the **Medical Gold** Power BI semantic model, from which the **Medical_Domain** Fabric IQ ontology is generated. The links track extraction provenance, not clinical or causal relationships. |
| Review and analytics | **Clinical Review 360** is a protected Hebrew RTL demo for validating and correcting candidates, separately from deciding whether they are `related`, `unrelated`, or `maybe` related to an incident of **פעולות איבה**. **Medical Gold Data Agent** starts as an unpublished draft with no data sources. |

## Deploy and verify

1. Clone the repository: `git clone https://github.com/Shemerten/MedicalRecordAnalysis.git`.
2. In your target tenant, verify an active Central US Fabric capacity and use **one workspace** throughout. Verify that it supports Lakehouse/Spark, Power BI modeling, Fabric IQ, and the preview workloads you plan to use. Create the schema-enabled `medical_documents` Lakehouse and its `Files/raw` folder.
3. Generate the fixture with `python scripts\make_synthetic_pdf.py`. Upload it using Lakehouse Explorer for the first smoke test, then import, bind, and run both notebooks. Expect **one page and seven candidates needing review**. A rerun should not add duplicate rows.
4. Publish the Gold SQL views and create the Power BI semantic model. Run the DAX check, then generate the ontology and verify its persisted keys, relationships, and metrics.
5. Deploy the two protected apps to the **same workspace** and verify synthetic uploads using the [uploader runbook](docs/uploader.md). Create the unpublished Data Agent draft without attaching patient data. Consult the [deployment status](docs/deployment-status.md) before treating any step as complete.

## Repository structure

| Path | Purpose |
|---|---|
| [notebooks/](notebooks/) | Portable PySpark notebooks for Bronze ingestion, Silver extraction, and typed Gold tables |
| [sql/](sql/) | Nine analytical Gold views and aggregate lineage validation |
| [semantic-model/](semantic-model/) | TMDL relationships/measures and DAX smoke query |
| [app/](app/) | Protected Hebrew clinician demo |
| [uploader/](uploader/) | Protected PDF intake frontend and OneLake upload function for the synthetic pilot |
| [data-agent/](data-agent/) | English/Hebrew instruction template |
| [scripts/](scripts/) | Deterministic synthetic PDF generator |
| [tests/](tests/) | Local extraction and analytics contract checks |
| [docs/](docs/) | Deployment runbooks and verification status |

## Local checks

```powershell
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -v
python scripts\make_synthetic_pdf.py
npm --prefix app run build
npm --prefix uploader ci
npm --prefix uploader test
npm --prefix uploader run build
```

Open `app\dist\index.html` to explore the synthetic app locally. No credentials or Fabric services are required for these checks. Follow the [runbook](docs/deploy.md) to verify Spark, SQL, Power BI and the ontology inside the new tenant.

**Synthetic pilot, not production clinical software.** No PDF or medical data is committed. Extracted entities are candidates, not verified medical facts or clinician decisions. The clinician demo does not connect to a live source or persist edits. Uploader tests mock OneLake; a deployed upload still requires verification. Keep raw and derived clinical data, generated files, and logs in approved storage and out of GitHub.
