import { MODELS } from '../config/models.js';
import { getGeminiClient } from '../gemini.js';

export interface GroundedSource {
  title: string;
  url: string;
}

export interface UniversityRulesResult {
  universityName: string;
  programName: string;
  requestedUrl?: string;
  modelUsed: string;
  fallbackUsed: boolean;
  summaryMarkdown: string;
  sources: GroundedSource[];
  retrievedUrls: string[];
  portalWarning?: string;
  fetchedAt: string;
}

/**
 * Uses `gemini-4-neon` with Google Search grounding + URL context (fallback `gemini-4-carbon`)
 * to read the chosen university's real requirements page and return rules with source links.
 */
export async function fetchUniversityRulesGrounded(params: {
  universityName: string;
  programName: string;
  url?: string;
}): Promise<UniversityRulesResult> {
  const ai = getGeminiClient();
  const { universityName, programName, url } = params;

  const prompt = [
    `Look up the official international admission and financial requirements for "${universityName}" — program: "${programName}".`,
    url ? `Prioritize reading this official page directly: ${url}` : '',
    'Provide a concise, plain-English list of:',
    '1. Academic / GPA / Indian degree requirements (including backlog policies if stated)',
    '2. English language requirements (IELTS/TOEFL/waiver)',
    '3. Annual tuition fee and any deposit requirement',
    '4. Application deadlines and whether they use a direct university portal (Slate, PeopleSoft, SITS, etc.) or Common App / UCAS',
    'Include the exact source URL next to each rule. If any item is not officially listed, say "Not stated on official page — verify with university." Never guess numbers.',
  ]
    .filter(Boolean)
    .join('\n');

  async function callModel(model: string, isFallback: boolean) {
    const startedAt = Date.now();
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }, { urlContext: {} }],
      },
    });
    console.info(
      `[gemini] task=universityRules model=${model} fallback=${isFallback} latencyMs=${Date.now() - startedAt}`
    );
    return response;
  }

  let response;
  let modelUsed: string = MODELS.universityRules.primary;
  let fallbackUsed = false;

  try {
    response = await callModel(MODELS.universityRules.primary, false);
  } catch (primaryErr) {
    console.warn(
      `[gemini] task=universityRules fallback triggered: ${MODELS.universityRules.primary} -> ${MODELS.universityRules.fallback}:`,
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    );
    modelUsed = MODELS.universityRules.fallback;
    fallbackUsed = true;
    response = await callModel(MODELS.universityRules.fallback, true);
  }

  const candidate = response.candidates?.[0] as any;
  const chunks: any[] = candidate?.groundingMetadata?.groundingChunks || [];
  const urlMetadata: any[] = candidate?.urlContextMetadata?.urlMetadata || [];

  const sourceMap = new Map<string, string>();
  for (const chunk of chunks) {
    if (chunk?.web?.uri) {
      sourceMap.set(chunk.web.uri, chunk.web.title || chunk.web.uri);
    }
  }
  const retrievedUrls: string[] = [];
  for (const meta of urlMetadata) {
    if (meta?.retrievedUrl) {
      retrievedUrls.push(meta.retrievedUrl);
      if (!sourceMap.has(meta.retrievedUrl)) {
        sourceMap.set(meta.retrievedUrl, meta.retrievedUrl);
      }
    }
  }

  const text = response.text?.trim() || 'No official requirements returned.';
  const mentionsRestricted = /\b(common\s*app|ucas)\b/i.test(`${url || ''} ${text}`);

  return {
    universityName,
    programName,
    requestedUrl: url,
    modelUsed,
    fallbackUsed,
    summaryMarkdown: text,
    sources: Array.from(sourceMap.entries()).map(([sUrl, title]) => ({
      title,
      url: sUrl,
    })),
    retrievedUrls,
    portalWarning: mentionsRestricted
      ? 'Reminder: Aira never automates Common App or UCAS. Use the university’s direct portal (Slate, PeopleSoft, SITS) or /portal.'
      : undefined,
    fetchedAt: new Date().toISOString(),
  };
}
