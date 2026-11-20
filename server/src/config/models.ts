export const MODELS = {
  extraction: {
    primary: 'gemini-4-hydrogen',
    fallback: 'gemini-3.8-flash',
  },
  audit: {
    primary: 'gemini-4-carbon',
    fallback: 'gemini-4-argon',
  },
  computerUse: {
    primary: 'gemini-4-hydrogen',
    fallback: 'gemini-4-carbon',
  },
  universityRules: {
    primary: 'gemini-4-neon',
    fallback: 'gemini-4-carbon',
  },
  smallSteps: {
    primary: 'gemini-3.8-flash',
    fallback: null,
  },
} as const;

export const ALLOWED_MODEL_PREFIXES = ['gemini-4', 'gemini-3.8'] as const;
