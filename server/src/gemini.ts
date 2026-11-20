import { GoogleGenAI } from '@google/genai';
import { ALLOWED_MODEL_PREFIXES } from './config/models.js';

export interface GeminiClientLike {
  models: {
    generateContent: (params: {
      model: string;
      contents: string;
    }) => Promise<{ text?: string }>;
    list: () => Promise<AsyncIterable<{ name?: string; displayName?: string }>>;
  };
}

let cachedClient: GoogleGenAI | null = null;

export function createGeminiClient(): GoogleGenAI {
  const useVertex = process.env.USE_VERTEX === 'true';

  if (useVertex) {
    const project = process.env.GOOGLE_CLOUD_PROJECT || 'continual-air-515306-b6';
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'asia-south1';
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Copy .env.example to .env and add your key locally, or configure Secret Manager in Cloud Run.'
    );
  }

  return new GoogleGenAI({ apiKey });
}

export function getGeminiClient(): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = createGeminiClient();
  }
  return cachedClient;
}

export function normalizeModelName(rawName: string): string {
  return rawName
    .replace(/^publishers\/google\/models\//, '')
    .replace(/^models\//, '')
    .trim();
}

export function filterAllowedModelNames(rawNames: string[]): string[] {
  const unique = new Set<string>();
  for (const raw of rawNames) {
    const normalized = normalizeModelName(raw);
    if (ALLOWED_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      unique.add(normalized);
    }
  }
  return Array.from(unique).sort();
}

export async function listAllowedModels(
  client: GeminiClientLike = getGeminiClient()
): Promise<string[]> {
  const pager = await client.models.list();
  const rawNames: string[] = [];
  for await (const model of pager) {
    if (model.name) {
      rawNames.push(model.name);
    }
  }
  return filterAllowedModelNames(rawNames);
}

export interface GenerateWithFallbackParams {
  primaryModel: string;
  fallbackModel?: string | null;
  prompt: string;
  client?: GeminiClientLike;
  logger?: Pick<Console, 'warn' | 'info' | 'error'>;
}

export interface GenerateWithFallbackResult {
  model: string;
  text: string;
  latencyMs: number;
  fallbackUsed: boolean;
}

export async function generateWithFallback({
  primaryModel,
  fallbackModel = null,
  prompt,
  client = getGeminiClient(),
  logger = console,
}: GenerateWithFallbackParams): Promise<GenerateWithFallbackResult> {
  const startedAt = Date.now();

  try {
    const response = await client.models.generateContent({
      model: primaryModel,
      contents: prompt,
    });
    const text = response.text?.trim() ?? '';
    if (!text) {
      throw new Error(`Model ${primaryModel} returned an empty response.`);
    }
    const latencyMs = Date.now() - startedAt;
    logger.info(`[gemini] model=${primaryModel} fallback=false latencyMs=${latencyMs}`);
    return {
      model: primaryModel,
      text,
      latencyMs,
      fallbackUsed: false,
    };
  } catch (primaryError) {
    const primaryMessage =
      primaryError instanceof Error ? primaryError.message : String(primaryError);

    if (!fallbackModel) {
      logger.error(`[gemini] model=${primaryModel} failed with no fallback: ${primaryMessage}`);
      throw new Error(`Gemini call failed on ${primaryModel}: ${primaryMessage}`);
    }

    logger.warn(
      `[gemini] fallback triggered: primary=${primaryModel} -> fallback=${fallbackModel} reason=${primaryMessage}`
    );

    const fallbackStartedAt = Date.now();
    try {
      const fallbackResponse = await client.models.generateContent({
        model: fallbackModel,
        contents: prompt,
      });
      const text = fallbackResponse.text?.trim() ?? '';
      if (!text) {
        throw new Error(`Fallback model ${fallbackModel} returned an empty response.`);
      }
      const latencyMs = Date.now() - fallbackStartedAt;
      logger.info(`[gemini] model=${fallbackModel} fallback=true latencyMs=${latencyMs}`);
      return {
        model: fallbackModel,
        text,
        latencyMs,
        fallbackUsed: true,
      };
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      logger.error(
        `[gemini] both primary=${primaryModel} and fallback=${fallbackModel} failed: ${fallbackMessage}`
      );
      throw new Error(
        `Gemini call failed on ${primaryModel} (${primaryMessage}) and fallback ${fallbackModel} (${fallbackMessage})`
      );
    }
  }
}
