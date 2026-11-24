-- Run in the medical_documents Lakehouse SQL analytics endpoint.
-- These views do not copy data or replace the extraction tables.

EXEC(N'CREATE OR ALTER VIEW gold.domain_source_documents AS
SELECT DISTINCT CONVERT(varchar(64), document_id) AS document_id
FROM gold.extraction_runs
WHERE rule_version = ''he_clinical_v2'' AND checked_at IS NOT NULL AND document_id IS NOT NULL;');

EXEC(N'CREATE OR ALTER VIEW gold.domain_extraction_runs AS
SELECT CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       CONVERT(varchar(64), document_id) AS document_id,
       CONVERT(varchar(32), rule_version) AS rule_version,
       source_pages, candidate_count, checked_at
FROM gold.extraction_runs
WHERE rule_version = ''he_clinical_v2'' AND checked_at IS NOT NULL AND document_id IS NOT NULL;');

-- Use the exact same key construction on both ends of the relationships.

EXEC(N'CREATE OR ALTER VIEW gold.domain_visit_candidates AS
SELECT CONVERT(varchar(64), candidate_id) AS candidate_id,
       CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       event_date AS record_date, page_number, line_number, CONVERT(varchar(32), review_status) AS review_status
FROM gold.visits WHERE rule_version = ''he_clinical_v2'';');

EXEC(N'CREATE OR ALTER VIEW gold.domain_diagnosis_mentions AS
SELECT CONVERT(varchar(64), candidate_id) AS candidate_id,
       CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       event_date AS record_date, page_number, line_number, CONVERT(varchar(32), review_status) AS review_status
FROM gold.diagnoses WHERE rule_version = ''he_clinical_v2'';');

EXEC(N'CREATE OR ALTER VIEW gold.domain_medication_mentions AS
SELECT CONVERT(varchar(64), candidate_id) AS candidate_id,
       CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       event_date AS record_date, page_number, line_number, CONVERT(varchar(32), review_status) AS review_status
FROM gold.medications WHERE rule_version = ''he_clinical_v2'';');

EXEC(N'CREATE OR ALTER VIEW gold.domain_test_mentions AS
SELECT CONVERT(varchar(64), candidate_id) AS candidate_id,
       CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       event_date AS record_date, page_number, line_number, CONVERT(varchar(32), review_status) AS review_status
FROM gold.tests WHERE rule_version = ''he_clinical_v2'';');

EXEC(N'CREATE OR ALTER VIEW gold.domain_treatment_mentions AS
SELECT CONVERT(varchar(64), candidate_id) AS candidate_id,
       CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       event_date AS record_date, page_number, line_number, CONVERT(varchar(32), review_status) AS review_status
FROM gold.treatments WHERE rule_version = ''he_clinical_v2'';');

EXEC(N'CREATE OR ALTER VIEW gold.domain_referral_mentions AS
SELECT CONVERT(varchar(64), candidate_id) AS candidate_id,
       CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       event_date AS record_date, page_number, line_number, CONVERT(varchar(32), review_status) AS review_status
FROM gold.referrals WHERE rule_version = ''he_clinical_v2'';');

EXEC(N'CREATE OR ALTER VIEW gold.domain_date_mentions AS
SELECT CONVERT(varchar(64), candidate_id) AS candidate_id,
       CONVERT(varchar(64), HASHBYTES(''SHA2_256'', CONCAT(document_id, '':'', rule_version)), 2) AS run_key,
       event_date AS mentioned_date, page_number, line_number, CONVERT(varchar(32), review_status) AS review_status
FROM gold.date_mentions WHERE rule_version = ''he_clinical_v2'';');

;WITH candidate AS (
    SELECT 'visit' AS category, candidate_id, run_key, record_date AS extracted_date, review_status, page_number, line_number FROM gold.domain_visit_candidates
    UNION ALL SELECT 'diagnosis', candidate_id, run_key, record_date, review_status, page_number, line_number FROM gold.domain_diagnosis_mentions
    UNION ALL SELECT 'medication', candidate_id, run_key, record_date, review_status, page_number, line_number FROM gold.domain_medication_mentions
    UNION ALL SELECT 'test', candidate_id, run_key, record_date, review_status, page_number, line_number FROM gold.domain_test_mentions
    UNION ALL SELECT 'treatment', candidate_id, run_key, record_date, review_status, page_number, line_number FROM gold.domain_treatment_mentions
    UNION ALL SELECT 'referral', candidate_id, run_key, record_date, review_status, page_number, line_number FROM gold.domain_referral_mentions
    UNION ALL SELECT 'date mention', candidate_id, run_key, mentioned_date, review_status, page_number, line_number FROM gold.domain_date_mentions
)
SELECT category, COUNT(*) AS candidate_count, COUNT(DISTINCT c.candidate_id) AS distinct_candidate_count,
       COUNT(c.extracted_date) AS dated_count,
       SUM(CASE WHEN r.run_key IS NULL THEN 1 ELSE 0 END) AS missing_run,
       SUM(CASE WHEN c.review_status = 'needs_review' AND c.page_number > 0 AND c.line_number > 0 THEN 0 ELSE 1 END) AS invalid_lineage
FROM candidate AS c
LEFT JOIN gold.domain_extraction_runs AS r ON r.run_key = c.run_key
GROUP BY category ORDER BY category;
