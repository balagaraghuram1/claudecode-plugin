---
description: Match a biomarker/gene to clinical trials using mutation prevalence and trial data
---

Analyze biomarker-to-clinical-trial matching for:

$ARGUMENTS

Use the analyze_biomarker_trial_match tool with the provided gene/biomarker. If a cancer type is mentioned, include it. Present:
1. Mutation prevalence across cancer studies
2. Matching active clinical trials
3. A combined summary report

If the user provides just a gene name (e.g. "EGFR"), search across all cancer types. If they specify a cancer type (e.g. "EGFR in lung cancer"), use that to narrow results.
