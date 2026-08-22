---
"nestjs-doctor": minor
---

`--output` now names where `--report` writes the HTML.

The report always wrote `nestjs-doctor-report.html` into the directory being
scanned, so scanning a repository left an untracked file inside it. `--output`
existed but was ignored whenever `--report` was set. It is now honored for both:
a relative path resolves against the working directory, and missing parent
directories are created.

```bash
npx nestjs-doctor . --report --output /tmp/health.html
```

Nothing changes without the flag. The default is still the project root.
