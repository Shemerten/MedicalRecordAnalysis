# Deployment status

| Component | Evidence and remaining work |
|---|---|
| Capacity and workspace | The existing Central US F64 is active. All rebuilt items belong in the `Medical Document Ingestion - Central US` workspace on that capacity. |
| OneLake landing | The schema-enabled `medical_documents` Lakehouse and its SQL analytics endpoint are verified. `Files/raw` and `Files/_pdf_uploader_pending` exist. A direct OneLake upload of the generated synthetic fixture was read back with matching length and SHA-256. This does not verify the Fabric uploader app. |
| Data and analytics | Both PySpark notebooks are installed in the target workspace. The first on-demand Bronze-to-Silver run failed with a Spark statement-execution error; the SQL endpoint did not show any medallion tables afterward. Diagnose and verify that notebook before running clinical extraction. The Gold views, `Medical Gold`, and `Medical_Domain` are verified only in the reference deployment, not in this workspace. The local synthetic extraction and SQL/TMDL alignment checks pass. |
| Clinical Review 360 | Reference deployment was protected and synthetic. No live connector or durable writeback was enabled. Deploy the sanitized demo alongside the new Central US pipeline. |
| PDF Data Uploader | Protected multi-file app and synthetic-only write function are in this repository. Local tests mock OneLake; the deployed authentication and OneLake write/rename are not verified. Rayfin interactive sign-in did not complete in this session. |
| Data Agent | Reference item was an unpublished draft with no sources. Recreate that state in the target workspace. Live grounding and publication are outside the verified baseline. |

No PDF, source text, credentials, tenant IDs, or medical rows are in the repository. No source-tenant data was migrated and no existing item was removed or repointed.
