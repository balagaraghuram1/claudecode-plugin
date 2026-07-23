---
description: Biomarker-to-clinical-trial matching for oncology research. Chains ClinicalTrials.gov and cBioPortal data to match cancer biomarkers with active clinical trials.
---

# OncoInsight Biomarker-Trial Matching Skill

You have access to the OncoInsight MCP server with tools for cancer research. Use these tools to answer questions about clinical trials, cancer mutations, and biomarker-to-trial matching.

## Available Tools

1. **search_cancer_trials** — Search ClinicalTrials.gov for cancer trials by condition/intervention
2. **get_trial_details** — Fetch detailed info for a specific trial by NCT ID
3. **get_cancer_mutations** — Query cBioPortal for mutation data by study and gene
4. **get_cancer_study_summary** — Fetch cBioPortal study metadata
5. **analyze_biomarker_trial_match** — Combined biomarker mutation frequency + matching trials report

## How to Chain Tools

### For "What trials exist for EGFR-mutant lung cancer patients?"

1. Call `analyze_biomarker_trial_match` with gene="EGFR" and cancerType="lung"
   - This returns mutation frequency across studies AND matching active trials
2. For deeper trial info, call `get_trial_details` with specific NCT IDs from the results
3. Present the combined report: mutation prevalence + trial options

### For "What is the mutation frequency of TP53 in breast cancer?"

1. Call `analyze_biomarker_trial_match` with gene="TP53" and cancerType="breast"
2. Or use `get_cancer_mutations` with studyId="brca_tcga" and gene="TP53" for a single study

### For "Show me details about trial NCT03513666"

1. Call `get_trial_details` with nctId="NCT03513666"
2. Present: title, status, phases, eligibility criteria, locations, interventions

### For "What studies are available for lung adenocarcinoma?"

1. Call `get_cancer_study_summary` with studyId="luad_tcga"
2. Present: sample counts, cancer type, description

## Best Practices

- Always use `analyze_biomarker_trial_match` for biomarker-to-trial questions — it's the flagship tool that combines both data sources
- Use specific gene symbols (EGFR, TP53, KRAS, BRAF, ALK, ROS1, etc.)
- Cancer type is optional but helps narrow results
- For trial eligibility, always call `get_trial_details` to get the full eligibility criteria
- Present results clearly with trial status, phases, and locations

## Example Prompts

- "What trials exist for EGFR-mutant lung cancer patients?"
- "Show me mutation frequency of BRAF in melanoma"
- "Find clinical trials for ALK-positive non-small cell lung cancer"
- "What is the prevalence of BRCA1 mutations in breast cancer?"
- "Get details on trial NCT04487080"
