# Business Analyst Assessment – Gilad Cohen-Tal

Answers to a Business Analyst home assignment. The answers site is published at https://giladct.github.io/avatrade/.

| Folder | What it holds |
|---|---|
| `deliverables/` | The submitted document (Word and PDF), the Section E Excel workbook and the Snowflake SQL |
| `content/` | `answers.md`, the single source for every answer; `answers_he.md`, a Hebrew translation (switched off) |
| `site/` | Interactive answer site (template, JavaScript) and the built `index.html` |
| `docs/` | The GitHub Pages copy of the site, with the PDF and the workbook for download |
| `build/` | Scripts that build the site, the PDF, the Word document and the workbook |

## Build

```bash
python build/build_site.py    # site/index.html and docs/index.html
bash build/build_pdf.sh       # deliverables/*.pdf (the site printed by Chrome, needs the site served on port 8765)
python build/build_docx.py    # deliverables/*.docx
python build/build_xlsx.py    # deliverables/Section_E_Subscription_Model.xlsx (recalculate in Excel before sending)
```
