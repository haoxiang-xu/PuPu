---
name: pdf-form-filler
description: >
  Fill in PDF forms with structured data, validate required fields, and
  export a completed copy without altering the original template.
metadata:
  category: documents
  license: Apache-2.0
  version: 1.2.0
allowed-tools: [Read, Write, Bash]
---

# PDF Form Filler

Use this skill whenever the user asks to fill out, complete, or populate a PDF form.

## Steps

1. Locate the source PDF and the field values to apply.
2. Run the filler script:

```bash
python fill_form.py --input form.pdf --output filled.pdf
---
not a real fence, just literal text with dashes
---
```

3. Confirm the output file was created before reporting success.

See the [PDF toolkit reference](https://example.com/docs/pdf-toolkit) for supported field types.
