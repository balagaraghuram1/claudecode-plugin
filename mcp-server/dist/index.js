"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
// ── In-memory cache ──────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
function cached(key) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL)
        return entry.data;
    cache.delete(key);
    return null;
}
function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
}
// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function apiFetch(url, retries = 2) {
    const key = url;
    const hit = cached(key);
    if (hit !== null)
        return hit;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(30000),
            });
            if (res.status === 429) {
                const wait = Math.pow(2, attempt) * 1000;
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
            }
            const data = await res.json();
            setCache(key, data);
            return data;
        }
        catch (err) {
            if (attempt === retries)
                throw err;
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    throw new Error("Unreachable");
}
// ── Tool implementations ─────────────────────────────────────────────────────
async function searchCancerTrials(condition, intervention, pageSize = 10) {
    const params = new URLSearchParams({
        "query.cond": condition,
        pageSize: String(pageSize),
    });
    if (intervention)
        params.set("query.intr", intervention);
    const url = `https://clinicaltrials.gov/api/v2/studies?${params}`;
    const raw = (await apiFetch(url));
    const trials = (raw.studies || []).map((s) => {
        const p = s.protocolSection;
        const id = p.identificationModule;
        const design = p.designModule;
        const status = p.statusModule;
        const locs = p.contactsLocationsModule?.locations || [];
        return {
            nctId: id.nctId,
            title: id.briefTitle,
            officialTitle: id.officialTitle,
            phase: design?.phases?.join(", ") || "Not specified",
            status: status?.overallStatus || "Unknown",
            startDate: status?.startDateStruct?.date || "Unknown",
            locations: locs.slice(0, 5).map((l) => ({
                facility: l.facility,
                city: l.city,
                state: l.state,
                country: l.country,
            })),
        };
    });
    return {
        totalCount: raw.totalCount || 0,
        trials,
    };
}
async function getTrialDetails(nctId) {
    const url = `https://clinicaltrials.gov/api/v2/studies/${nctId}`;
    const raw = (await apiFetch(url));
    const p = raw.protocolSection;
    const id = p.identificationModule;
    const design = p.designModule;
    const status = p.statusModule;
    const elig = p.eligibilityModule;
    const conditions = p.conditionsModule;
    const arms = p.armsInterventionsModule;
    const contacts = p.centralContactsModule;
    const locs = p.contactsLocationsModule?.locations || [];
    return {
        nctId: id.nctId,
        title: id.briefTitle,
        officialTitle: id.officialTitle,
        briefSummary: id.briefSummary,
        detailedDescription: id.detailedDescription,
        phase: design?.phases?.join(", ") || "Not specified",
        studyType: design?.studyType || "Unknown",
        enrollment: design?.enrollmentInfo,
        status: status?.overallStatus || "Unknown",
        startDate: status?.startDateStruct?.date,
        completionDate: status?.completionDateStruct?.date,
        lastUpdate: status?.lastUpdatePostDateStruct?.date,
        conditions: conditions?.conditions || [],
        keywords: conditions?.keywords || [],
        eligibilityCriteria: elig?.eligibilityCriteria,
        minimumAge: elig?.minimumAge,
        maximumAge: elig?.maximumAge,
        sex: elig?.sex,
        healthyVolunteers: elig?.healthyVolunteers,
        primaryOutcomes: design?.primaryOutcomes || [],
        secondaryOutcomes: design?.secondaryOutcomes || [],
        interventions: arms?.interventions || [],
        locations: locs.slice(0, 10).map((l) => ({
            facility: l.facility,
            city: l.city,
            state: l.state,
            country: l.country,
        })),
        contacts: contacts?.overallOfficial || [],
    };
}
async function getCancerMutations(studyId, gene) {
    // Step 0: Look up entrez gene ID from gene symbol
    const geneUrl = `https://www.cbioportal.org/api/genes/${gene}`;
    let entrezGeneId;
    try {
        const geneData = (await apiFetch(geneUrl));
        entrezGeneId = geneData.entrezGeneId;
    }
    catch {
        return {
            studyId,
            gene,
            error: `Gene '${gene}' not found in cBioPortal`,
        };
    }
    // Step 1: Get molecular profiles for the study
    const profilesUrl = `https://www.cbioportal.org/api/studies/${studyId}/molecular-profiles`;
    const profiles = (await apiFetch(profilesUrl));
    // Find the mutation profile
    const mutProfile = profiles.find((p) => p.molecularAlterationType === "MUTATION" ||
        p.molecularAlterationType === "MUTATION_UNFILTERED" ||
        p.molecularAlterationType === "MUTATION_EXTENDED");
    if (!mutProfile) {
        return {
            studyId,
            gene,
            error: "No mutation profile found for this study",
            availableProfiles: profiles.map((p) => p.molecularAlterationType),
        };
    }
    // Step 2: Get mutations for the gene using entrezGeneId and sampleListId
    const sampleListId = `${studyId}_all`;
    const mutUrl = `https://www.cbioportal.org/api/molecular-profiles/${mutProfile.molecularProfileId}/mutations?sampleListId=${sampleListId}&entrezGeneId=${entrezGeneId}`;
    const mutations = (await apiFetch(mutUrl));
    // Aggregate by sample
    const sampleMap = new Map();
    for (const m of mutations) {
        const existing = sampleMap.get(m.sampleId);
        if (existing) {
            existing.mutations.push(m);
        }
        else {
            sampleMap.set(m.sampleId, { sampleId: m.sampleId, mutations: [m] });
        }
    }
    return {
        studyId,
        gene,
        entrezGeneId,
        molecularProfileId: mutProfile.molecularProfileId,
        totalSamples: sampleMap.size,
        totalMutations: mutations.length,
        mutations: mutations.slice(0, 50),
        samplesWithMutation: Array.from(sampleMap.keys()).slice(0, 20),
    };
}
async function getCancerStudySummary(studyId) {
    const url = `https://www.cbioportal.org/api/studies/${studyId}`;
    const study = (await apiFetch(url));
    return {
        studyId: study.studyId,
        name: study.name,
        description: study.description,
        citation: study.citation,
        pmid: study.pmid,
        cancerType: study.cancerType?.name || study.cancerTypes?.[0]?.name,
        totalSamples: study.allSampleCount,
        sequencedSamples: study.sequencedSampleCount,
        mutatedSamples: study.mutatedSampleCount,
    };
}
async function analyzeBiomarkerTrialMatch(gene, cancerType) {
    // Step 1: Query cBioPortal for mutation frequency
    let mutationData = null;
    try {
        // Get all studies
        const studiesUrl = "https://www.cbioportal.org/api/studies?sort=NAME:ASC";
        const studies = (await apiFetch(studiesUrl));
        // Filter by cancer type if provided
        let filteredStudies = studies;
        if (cancerType) {
            filteredStudies = studies.filter((s) => s.cancerType?.name
                ?.toLowerCase()
                .includes(cancerType.toLowerCase()) ||
                s.name.toLowerCase().includes(cancerType.toLowerCase()));
        }
        // Get mutation data for top studies (limit to avoid rate limits)
        const topStudies = filteredStudies.slice(0, 15);
        const mutationResults = [];
        // Look up entrez gene ID once
        let entrezGeneId = null;
        try {
            const geneUrl = `https://www.cbioportal.org/api/genes/${gene}`;
            const geneData = (await apiFetch(geneUrl));
            entrezGeneId = geneData.entrezGeneId;
        }
        catch {
            // Gene not found, skip mutation analysis
        }
        if (entrezGeneId !== null) {
            for (const study of topStudies) {
                try {
                    const profilesUrl = `https://www.cbioportal.org/api/studies/${study.studyId}/molecular-profiles`;
                    const profiles = (await apiFetch(profilesUrl));
                    const mutProfile = profiles.find((p) => p.molecularAlterationType === "MUTATION" ||
                        p.molecularAlterationType === "MUTATION_UNFILTERED" ||
                        p.molecularAlterationType === "MUTATION_EXTENDED");
                    if (!mutProfile)
                        continue;
                    const sampleListId = `${study.studyId}_all`;
                    const mutUrl = `https://www.cbioportal.org/api/molecular-profiles/${mutProfile.molecularProfileId}/mutations?sampleListId=${sampleListId}&entrezGeneId=${entrezGeneId}`;
                    const mutations = (await apiFetch(mutUrl));
                    const uniqueSamples = new Set(mutations.map((m) => m.sampleId));
                    const total = study.allSampleCount || 0;
                    const freq = total > 0 ? (uniqueSamples.size / total) * 100 : 0;
                    mutationResults.push({
                        studyId: study.studyId,
                        studyName: study.name,
                        cancerType: study.cancerType?.name || "Unknown",
                        totalSamples: total,
                        samplesWithMutation: uniqueSamples.size,
                        frequency: Math.round(freq * 100) / 100,
                    });
                }
                catch {
                    // Skip studies that fail
                }
            }
        }
        // Sort by frequency
        mutationResults.sort((a, b) => b.frequency - a.frequency);
        mutationData = {
            gene,
            studiesAnalyzed: mutationResults.length,
            topMutations: mutationResults.slice(0, 10),
        };
    }
    catch (err) {
        mutationData = {
            gene,
            error: `Failed to query cBioPortal: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    // Step 2: Query ClinicalTrials.gov for matching trials
    let trialData = null;
    try {
        const condition = cancerType || "cancer";
        const trialResult = await searchCancerTrials(condition, gene, 10);
        trialData = {
            query: `${gene} + ${condition}`,
            totalTrials: trialResult.totalCount,
            trials: trialResult.trials,
        };
    }
    catch (err) {
        trialData = {
            query: `${gene} + ${cancerType || "cancer"}`,
            error: `Failed to query ClinicalTrials.gov: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    // Step 3: Build combined report
    return {
        biomarker: gene,
        cancerType: cancerType || "All cancers",
        mutationPrevalence: mutationData,
        matchingTrials: trialData,
        summary: `Biomarker-to-trial matching report for ${gene}${cancerType ? ` in ${cancerType}` : ""}. Check mutation prevalence across studies and matching active clinical trials.`,
    };
}
// ── MCP Server setup ─────────────────────────────────────────────────────────
const server = new mcp_js_1.McpServer({
    name: "onco-insight",
    version: "0.1.0",
});
// Tool: search_cancer_trials
server.tool("search_cancer_trials", "Search ClinicalTrials.gov for cancer clinical trials by condition and optional intervention", {
    condition: zod_1.z.string().describe("Cancer condition to search for (e.g. 'lung cancer', 'breast cancer')"),
    intervention: zod_1.z.string().optional().describe("Optional intervention/drug to filter by (e.g. 'EGFR inhibitor')"),
    pageSize: zod_1.z.number().optional().default(10).describe("Number of results to return (default 10)"),
}, async ({ condition, intervention, pageSize }) => {
    try {
        const result = await searchCancerTrials(condition, intervention, pageSize);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
});
// Tool: get_trial_details
server.tool("get_trial_details", "Fetch detailed information for a specific clinical trial by NCT ID", {
    nctId: zod_1.z.string().describe("NCT ID of the trial (e.g. 'NCT03513666')"),
}, async ({ nctId }) => {
    try {
        const result = await getTrialDetails(nctId);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
});
// Tool: get_cancer_mutations
server.tool("get_cancer_mutations", "Query cBioPortal for mutation data by study and gene", {
    studyId: zod_1.z.string().describe("cBioPortal study ID (e.g. 'luad_tcga', 'brca_tcga')"),
    gene: zod_1.z.string().describe("Gene symbol (e.g. 'EGFR', 'TP53', 'KRAS')"),
}, async ({ studyId, gene }) => {
    try {
        const result = await getCancerMutations(studyId, gene);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
});
// Tool: get_cancer_study_summary
server.tool("get_cancer_study_summary", "Fetch cBioPortal study metadata and summary statistics", {
    studyId: zod_1.z.string().describe("cBioPortal study ID (e.g. 'luad_tcga', 'brca_tcga')"),
}, async ({ studyId }) => {
    try {
        const result = await getCancerStudySummary(studyId);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
});
// Tool: analyze_biomarker_trial_match
server.tool("analyze_biomarker_trial_match", "Flagship tool: Given a gene/biomarker, query cBioPortal for mutation frequency across studies and cross-reference ClinicalTrials.gov for matching trials. Returns a combined mutation prevalence + matching trials report.", {
    gene: zod_1.z.string().describe("Gene or biomarker name (e.g. 'EGFR', 'BRCA1', 'ALK')"),
    cancerType: zod_1.z.string().optional().describe("Optional cancer type to narrow results (e.g. 'lung', 'breast')"),
}, async ({ gene, cancerType }) => {
    try {
        const result = await analyzeBiomarkerTrialMatch(gene, cancerType);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
});
// ── Start server ─────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("OncoInsight MCP server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
