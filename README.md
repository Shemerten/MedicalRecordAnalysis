# Fabric Medical Records Blueprint

Deploy a Hebrew medical-document analytics workflow on **one Central US Microsoft Fabric capacity**, in this tenant or another one, without transferring the original tenant's data, settings or resource identities. This repository contains executable deployment assets and manual UI steps, not a one-click tenant migration.

**Deploying as an agent?** Start with [HANDOFF.md](HANDOFF.md). Operators can follow the [deployment runbook](docs/deploy.md).

## Architecture

1. **Bronze:** Original PDF in OneLake `Files/raw/`; a SHA-256 keyed Delta manifest in `bronze.pdf_documents`. The **PDF Data Uploader** preview provides a protected multi-file intake path for the generated fixture.
2. **Silver:** Page-text JSON and versioned clinical-candidate JSON, with Delta tables and source page/line evidence. Uses embedded PDF text (`pypdf`) and deterministic parsing; no OCR or LLM calls.
3. **Gold:** Typed Delta candidate tables and a checked run manifest. Narrow SQL views feed the **Medical Gold** semantic model and the **Medical_Domain** Fabric IQ ontology.
4. **Consumption:** A protected Hebrew RTL clinician **demo** illustrates validation, correction and independent `related` / `unrelated` / `maybe` classification for **פעולות איבה**. An optional **Data Agent** begins as an unpublished draft; no medical source or AI processing is enabled by the repo.

| Path | Purpose |
|---|---|
| [notebooks/](notebooks/) | PySpark ingestion and extraction, with target-specific inputs |
| [sql/](sql/) | Nine analytical Gold views and aggregate lineage validation |
| [semantic-model/](semantic-model/) | TMDL relationships/measures and DAX smoke query |
| [app/](app/) | Protected Fabric Apps/Rayfin synthetic demo |
| [uploader/](uploader/) | Protected PDF intake frontend and OneLake upload function for the synthetic pilot |
| [data-agent/](data-agent/) | English/Hebrew instruction template |
| [scripts/](scripts/) | Deterministic synthetic PDF generator |

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

**Not production clinical software.** Extracted entities are candidates, not medical facts or clinician decisions. Live app connectivity and writeback, AI grounding, and graph-instance materialization are not included in the verified baseline. Keep raw and derived clinical data inside approved storage and out of GitHub, including generated outputs and logs.
