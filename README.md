# Business Analyst Assessment – Gilad Cohen-Tal

Answers to a Business Analyst home assignment.

| Folder | What it holds |
|---|---|
| `deliverables/` | The submitted document (Word and PDF), the Section E Excel workbook and the Snowflake SQL |
| `content/` | `answers.md`, the single source for every answer; `explain_he.md`, Hebrew prep notes (site only) |
| `site/` | Interactive answer site (template, JavaScript, sample data) and the built `index.html` |
| `build/` | Python scripts that build the site, the Word document and the workbook |

## Build

```bash
python build/build_site.py    # site/index.html
python build/build_docx.py    # deliverables/*.docx
python build/build_xlsx.py    # deliverables/Section_E_Subscription_Model.xlsx
```

The PDF is exported from the Word file.
