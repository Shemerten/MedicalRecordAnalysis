# Deployment status

| Component | Evidence and remaining work |
|---|---|
| Capacity and workspace | Existing Central US F64 verified active in Azure Portal. The `Medical Document Ingestion - Central US` workspace was created on it. All rebuilt items belong in that workspace. Creation of the target Lakehouse and its `Files/raw` folder has not been verified. |
| Data and analytics | The reference medallion pipeline, Power BI semantic model, and ontology configuration were validated in the previous workspace. Portable notebook syntax, Hebrew parser checks, deterministic PDF-to-candidate counts, SQL/TMDL structure, and local app builds are checked locally. A Central US Fabric run must verify OneLake, Spark, SQL, DAX, and ontology in the target workspace. |
| Clinical Review 360 | Reference deployment was protected and synthetic. No live connector or durable writeback was enabled. Deploy the sanitized demo alongside the new Central US pipeline. |
| PDF Data Uploader | Protected multi-file app and synthetic-only write function are in this repository. Local tests mock OneLake; the deployed authentication and OneLake write/rename are not verified. Rayfin interactive sign-in did not complete in this session. |
| Data Agent | Reference item was an unpublished draft with no sources. Recreate that state in the target workspace. Live grounding and publication are outside the verified baseline. |

No PDF, source text, credentials, tenant IDs, or medical rows are in the repository. No source-tenant data was migrated and no existing item was removed or repointed.
