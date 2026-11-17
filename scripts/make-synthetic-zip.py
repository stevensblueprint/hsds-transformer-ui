"""Create the invented fixture used for local legacy ZIP boundary verification."""
import argparse
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path, help="New ZIP path; existing files are never overwritten")
args = parser.parse_args()
if args.output.exists():
    parser.error("Output already exists; choose a new path")
entries = {
    "synthetic.csv": "org_id,org_name\nsynthetic-1,Synthetic Harbor Center\n",
    "synthetic_organization_mapping.csv": "path,input_files_field,split,strip\n,,,\nid,org_id,,\nname,org_name,,\n",
}
with zipfile.ZipFile(args.output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
    for name, content in entries.items():
        info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, content)
print(f"Created synthetic-only fixture: {args.output}")
