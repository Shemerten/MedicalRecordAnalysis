import ast
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.make_synthetic_pdf import SYNTHETIC_LINES, build_pdf


def load_notebook(name):
    return json.loads((ROOT / "notebooks" / name).read_text(encoding="utf-8"))


def load_definitions(notebook, function_name):
    for cell in notebook["cells"]:
        source = "".join(cell["source"])
        if cell["cell_type"] != "code" or f"def {function_name}(" not in source:
            continue
        tree = ast.parse(source)
        if function_name == "extract_pdf":
            # Execute only imports, the function, and no Fabric calls.
            tree.body = [
                node for node in tree.body
                if (
                    isinstance(node, ast.Import) and all(alias.name != "notebookutils" for alias in node.names)
                    or isinstance(node, ast.ImportFrom)
                    or isinstance(node, ast.FunctionDef) and node.name == function_name
                )
            ]
        ns = {}
        exec(compile(tree, f"<notebook cell: {function_name}>", "exec"), ns)
        return ns
    raise AssertionError(f"Definition not found: {function_name}")


class BlueprintTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bronze = load_notebook("01-bronze-to-silver.ipynb")
        cls.clinical = load_notebook("02-clinical-extraction.ipynb")

    def test_notebooks_import_clean_without_tenant_binding(self):
        for notebook in (self.bronze, self.clinical):
            self.assertNotIn("dependencies", notebook["metadata"])
            self.assertEqual(notebook["metadata"]["kernelspec"]["name"], "synapse_pyspark")
            for cell in notebook["cells"]:
                if cell["cell_type"] != "code":
                    continue
                self.assertEqual(cell["outputs"], [])
                self.assertIsNone(cell["execution_count"])
                code = "".join(cell["source"])
                compile("\n".join(line for line in code.splitlines() if not line.startswith("%")), "<notebook>", "exec")

    def test_synthetic_pdf_to_clinical_candidates(self):
        data = build_pdf()
        self.assertEqual(data, build_pdf())
        extract = load_definitions(self.bronze, "extract_pdf")["extract_pdf"]
        pages = extract(data)
        self.assertEqual(len(pages), 1)
        page = pages[0]
        self.assertEqual(page["page_number"], 1)
        self.assertEqual(page["extraction_status"], "text_extracted")
        self.assertEqual(page["hebrew_letter_count"], 0)
        self.assertEqual(tuple(page["text"].splitlines()), SYNTHETIC_LINES)
        parser = load_definitions(self.clinical, "parse_page")
        rows = parser["parse_page"](sha256(data).hexdigest(), 1, page["text"])
        self.assertEqual(Counter(row["category"] for row in rows), dict.fromkeys(parser["KEYS"], 1))
        self.assertEqual(len({row["candidate_id"] for row in rows}), 7)
        for row in rows:
            self.assertEqual(row["review_status"], "needs_review")
            self.assertEqual(row["evidence_text"], SYNTHETIC_LINES[row["line_number"] - 1])
        self.assertEqual(
            {row["category"] for row in rows if row["event_date"]},
            {"visits", "date_mentions"},
        )

    def test_model_tables_and_relationships_match_published_views(self):
        sql = (ROOT / "sql" / "publish-domain.sql").read_text(encoding="utf-8")
        tmdl = (ROOT / "semantic-model" / "medical-lineage.tmdl").read_text(encoding="utf-8")
        views = set(re.findall(r"CREATE OR ALTER VIEW gold\.(domain_\w+)", sql))
        self.assertEqual(len(views), 9)
        self.assertEqual(views, set(re.findall(r"\b(?:fromColumn|toColumn): (domain_\w+)\.", tmdl)))
        self.assertEqual(len(re.findall(r"^\s*relationship ", tmdl, re.M)), 8)
        self.assertEqual(len(re.findall(r"^\s*measure ", tmdl, re.M)), 10)


if __name__ == "__main__":
    unittest.main()
