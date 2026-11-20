import { describe, expect, it, vi } from 'vitest';
import {
  filterAllowedModelNames,
  generateWithFallback,
  type GeminiClientLike,
} from './gemini.js';
import { MODELS } from './config/models.js';

describe('generateWithFallback', () => {
  it('returns the primary model response when primary succeeds', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'Hello from Aira Application Agent.',
    });
    const client: GeminiClientLike = {
      models: {
        generateContent,
        list: vi.fn(),
      },
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await generateWithFallback({
      primaryModel: MODELS.extraction.primary,
      fallbackModel: MODELS.extraction.fallback,
      prompt: 'Say hello.',
      client,
      logger,
    });

    expect(result.model).toBe('gemini-4-hydrogen');
    expect(result.text).toBe('Hello from Aira Application Agent.');
    expect(result.fallbackUsed).toBe(false);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to gemini-3.8-flash and logs a warning when primary fails', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 model overloaded'))
      .mockResolvedValueOnce({
        text: 'Fallback reply from Gemini 3.8 Flash.',
      });
    const client: GeminiClientLike = {
      models: {
        generateContent,
        list: vi.fn(),
      },
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await generateWithFallback({
      primaryModel: MODELS.extraction.primary,
      fallbackModel: MODELS.extraction.fallback,
      prompt: 'Say hello.',
      client,
      logger,
    });

    expect(result.model).toBe('gemini-3.8-flash');
    expect(result.text).toBe('Fallback reply from Gemini 3.8 Flash.');
    expect(result.fallbackUsed).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent).toHaveBeenNthCalledWith(1, {
      model: 'gemini-4-hydrogen',
      contents: 'Say hello.',
    });
    expect(generateContent).toHaveBeenNthCalledWith(2, {
      model: 'gemini-3.8-flash',
      contents: 'Say hello.',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when both primary and fallback fail', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('primary unavailable'))
      .mockRejectedValueOnce(new Error('fallback unavailable'));
    const client: GeminiClientLike = {
      models: {
        generateContent,
        list: vi.fn(),
      },
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await expect(
      generateWithFallback({
        primaryModel: MODELS.extraction.primary,
        fallbackModel: MODELS.extraction.fallback,
        prompt: 'Say hello.',
        client,
        logger,
      })
    ).rejects.toThrow(/gemini-4-hydrogen.*gemini-3.8-flash/);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('filterAllowedModelNames', () => {
  it('returns only gemini-4 and gemini-3.8 models without prefixes', () => {
    const filtered = filterAllowedModelNames([
      'models/gemini-4-hydrogen',
      'models/gemini-4-carbon',
      'publishers/google/models/gemini-3.8-flash',
      'models/gemini-2.5-flash',
      'models/gemini-2.0-pro',
      'models/gemini-1.5-pro',
    ]);

    expect(filtered).toEqual([
      'gemini-3.8-flash',
      'gemini-4-carbon',
      'gemini-4-hydrogen',
    ]);
  });
});
