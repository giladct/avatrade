#!/bin/sh
# PDF = the web page printed by Chrome (?print shows every question in one document, without the Hebrew notes).
# Needs the site served locally:  cd site && python -m http.server 8765
python build/build_site.py
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=10000 --print-to-pdf="$(cygpath -w "$PWD/deliverables/BA_Assessment_Gilad_Cohen-Tal.pdf")" \
  "http://127.0.0.1:8765/preview.html?print"
python build/stamp_pdf.py deliverables/BA_Assessment_Gilad_Cohen-Tal.pdf
