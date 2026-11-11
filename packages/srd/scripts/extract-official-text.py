"""Extract the official SRD 5.2.1 text that the checks read.

Usage: python extract-official-text.py SRD_CC_v5.2.1.pdf ../sources/official/srd-5.2.1.txt
Needs PyMuPDF (pip install pymupdf). The PDF's hash is in sources/sources.lock.json.
"""
import sys

import pymupdf

doc = pymupdf.open(sys.argv[1])
with open(sys.argv[2], "w") as out:
    out.write("\n\f".join(page.get_text() for page in doc))
