# OncoInsight — Cancer Research Plugin for Claude Code

AI-powered biomarker-to-clinical-trial matching for oncology research. Query **ClinicalTrials.gov** and **cBioPortal** to match cancer biomarkers with active clinical trials.

## Features

- **Biomarker-to-Trial Matching**: Query a gene (e.g. EGFR, TP53, BRAF) and get mutation frequency across studies plus matching active clinical trials
- **Clinical Trial Search**: Search ClinicalTrials.gov for cancer trials by condition and intervention
- **Trial Details**: Fetch full trial information including eligibility criteria, phases, locations, and interventions
- **Cancer Mutation Data**: Query cBioPortal for mutation data by study and gene
- **Study Summaries**: Get cBioPortal study metadata and sample statistics

## Installation

### Via Plugin Marketplace

```
/plugin marketplace add balagaraghuram1/claudecode-plugin
/plugin install onco-insight
```

### Via Local Directory

```
/plugin install --path /path/to/claudecode-plugin
```

## Usage

### Slash Commands

- `/onco-insight:search-trials lung cancer` — Search for lung cancer clinical trials
- `/onco-insight:biomarker-match EGFR` — Match EGFR biomarker to clinical trials

### Example Prompts

**Biomarker-to-trial matching:**
> "What trials exist for EGFR-mutant lung cancer patients?"

**Mutation frequency:**
> "Show me the mutation frequency of TP53 in breast cancer"

**Trial details:**
> "Get details about trial NCT03513666"

**Study information:**
> "What studies are available for lung adenocarcinoma?"

**Combined analysis:**
> "Find clinical trials for ALK-positive non-small cell lung cancer and show mutation prevalence"

## How It Works

OncoInsight connects to two public APIs:

1. **ClinicalTrials.gov API v2** — Search and retrieve clinical trial information
2. **cBioPortal Public API** — Access cancer genomics mutation data

The flagship `analyze_biomarker_trial_match` tool chains both sources:
1. Queries cBioPortal for mutation frequency of the given gene across cancer studies
2. Cross-references ClinicalTrials.gov for trials targeting that biomarker
3. Returns a combined report with mutation prevalence + matching active trials

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_cancer_trials` | Search ClinicalTrials.gov by condition/intervention |
| `get_trial_details` | Fetch full trial details by NCT ID |
| `get_cancer_mutations` | Query cBioPortal for mutation data |
| `get_cancer_study_summary` | Get study metadata from cBioPortal |
| `analyze_biomarker_trial_match` | Combined biomarker mutation + trial matching |

## Requirements

- Claude Code with plugin support
- Node.js 18+ (for the MCP server)

## License

MIT
