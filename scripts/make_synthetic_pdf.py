"""Generate a deterministic embedded-text PDF without fonts or external data."""

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_LINES = (
    "SYNTHETIC QA ONLY - not a patient record",
    "Visit date: 2026-01-15",
    "Diagnosis: Synthetic example",
    "Medications: Placeholder 25 mg",
    "Tests: Synthetic test mention",
    "Treatments: Synthetic treatment mention",
    "Referrals: Synthetic referral mention",
)


def build_pdf():
    stream = (
        "BT /F1 14 Tf 50 760 Td 24 TL "
        + " T* ".join(f"({line}) Tj" for line in SYNTHETIC_LINES)
        + " ET\n"
    ).encode("ascii")
    objects = (
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"endstream",
    )
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += f"{index} 0 obj\n".encode("ascii") + obj + b"\nendobj\n"
    xref_offset = len(pdf)
    count = len(objects) + 1
    pdf += f"xref\n0 {count}\n0000000000 65535 f \n".encode("ascii")
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    return bytes(pdf)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "generated" / "synthetic-medical-record.pdf")
    output = parser.parse_args().out
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as file:
        file.write(build_pdf())
    print(output)


if __name__ == "__main__":
    main()
