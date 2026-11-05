export const QUOTA_KINDS = ["chat", "search", "aux", "transcribe"] as const;
export type QuotaKind = (typeof QUOTA_KINDS)[number];
export type Tier = "free" | "premium";
export type QuotaSetting = { perMinute: number; perDay: number };

export type RuntimeSettings = {
  quotasManaged: boolean;
  quotas: Record<Tier, Record<QuotaKind, QuotaSetting>>;
  models: { gemini: boolean; openai: boolean; anthropic: boolean };
  maintenance: { enabled: boolean; message: string };
  features: { search: boolean; voiceInput: boolean; attachments: boolean; projects: boolean; memory: boolean };
};

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  quotasManaged: false,
  quotas: {
    free: {
      chat: { perMinute: 12, perDay: 150 },
      search: { perMinute: 6, perDay: 40 },
      aux: { perMinute: 30, perDay: 400 },
      transcribe: { perMinute: 10, perDay: 100 },
    },
    premium: {
      chat: { perMinute: 30, perDay: 1000 },
      search: { perMinute: 12, perDay: 200 },
      aux: { perMinute: 60, perDay: 2000 },
      transcribe: { perMinute: 30, perDay: 500 },
    },
  },
  models: { gemini: true, openai: true, anthropic: true },
  maintenance: { enabled: false, message: "Turzam AI is temporarily in maintenance. Please try again soon." },
  features: { search: true, voiceInput: true, attachments: true, projects: true, memory: true },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

export function normalizeRuntimeSettings(raw: unknown): RuntimeSettings {
  const input = record(raw);
  const inputQuotas = record(input.quotas);
  const quotas = { free: {} as Record<QuotaKind, QuotaSetting>, premium: {} as Record<QuotaKind, QuotaSetting> };
  for (const tier of ["free", "premium"] as const) {
    const tierInput = record(inputQuotas[tier]);
    for (const kind of QUOTA_KINDS) {
      const base = DEFAULT_RUNTIME_SETTINGS.quotas[tier][kind];
      const item = record(tierInput[kind]);
      quotas[tier][kind] = {
        perMinute: boundedInt(item.perMinute, base.perMinute, 1, 120),
        perDay: boundedInt(item.perDay, base.perDay, 1, 5000),
      };
    }
  }
  const models = record(input.models);
  const maintenance = record(input.maintenance);
  const features = record(input.features);
  const message = typeof maintenance.message === "string" ? maintenance.message.slice(0, 280) : DEFAULT_RUNTIME_SETTINGS.maintenance.message;
  return {
    quotasManaged: booleanOr(input.quotasManaged, false),
    quotas,
    models: {
      gemini: booleanOr(models.gemini, true),
      openai: booleanOr(models.openai, true),
      anthropic: booleanOr(models.anthropic, true),
    },
    maintenance: { enabled: booleanOr(maintenance.enabled, false), message },
    features: {
      search: booleanOr(features.search, true),
      voiceInput: booleanOr(features.voiceInput, true),
      attachments: booleanOr(features.attachments, true),
      projects: booleanOr(features.projects, true),
      memory: booleanOr(features.memory, true),
    },
  };
}

/** Validate and merge a partial update; reject unknown fields rather than silently ignoring them. */
export function patchRuntimeSettings(current: unknown, patchValue: unknown): RuntimeSettings | null {
  const patch = record(patchValue);
  if (Object.keys(patch).some((k) => !["quotas", "models", "maintenance", "features"].includes(k))) return null;
  const next = normalizeRuntimeSettings(current);

  if ("quotas" in patch) {
    next.quotasManaged = true;
    const tiers = record(patch.quotas);
    if (Object.keys(tiers).some((k) => k !== "free" && k !== "premium")) return null;
    for (const tier of ["free", "premium"] as const) {
      if (!(tier in tiers)) continue;
      const kinds = record(tiers[tier]);
      if (Object.keys(kinds).some((k) => !(QUOTA_KINDS as readonly string[]).includes(k))) return null;
      for (const kind of QUOTA_KINDS) {
        if (!(kind in kinds)) continue;
        const values = record(kinds[kind]);
        if (Object.keys(values).some((k) => k !== "perMinute" && k !== "perDay")) return null;
        const merged = { ...next.quotas[tier][kind] };
        for (const key of ["perMinute", "perDay"] as const) {
          if (!(key in values)) continue;
          const value = values[key];
          const max = key === "perMinute" ? 120 : 5000;
          if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max) return null;
          merged[key] = value;
        }
        next.quotas[tier][kind] = merged;
      }
    }
  }

  if ("models" in patch) {
    const models = record(patch.models);
    if (Object.keys(models).some((k) => !["gemini", "openai", "anthropic"].includes(k)) || Object.values(models).some((v) => typeof v !== "boolean")) return null;
    next.models = { ...next.models, ...models } as RuntimeSettings["models"];
  }

  if ("maintenance" in patch) {
    const maintenance = record(patch.maintenance);
    if (Object.keys(maintenance).some((k) => k !== "enabled" && k !== "message")) return null;
    if ("enabled" in maintenance && typeof maintenance.enabled !== "boolean") return null;
    if ("message" in maintenance && (typeof maintenance.message !== "string" || maintenance.message.length > 280)) return null;
    next.maintenance = { ...next.maintenance, ...maintenance } as RuntimeSettings["maintenance"];
  }

  if ("features" in patch) {
    const features = record(patch.features);
    const allowed = ["search", "voiceInput", "attachments", "projects", "memory"];
    if (Object.keys(features).some((k) => !allowed.includes(k)) || Object.values(features).some((v) => typeof v !== "boolean")) return null;
    next.features = { ...next.features, ...features } as RuntimeSettings["features"];
  }

  return next;
}

export function quotaForTier(settings: RuntimeSettings, tier: Tier, kind: QuotaKind): QuotaSetting {
  return settings.quotas[tier][kind];
}

export function enabledProviders(settings: RuntimeSettings, hasKey: (provider: "gemini" | "openai" | "anthropic") => boolean) {
  return (["gemini", "openai", "anthropic"] as const).filter((provider) => settings.models[provider] && hasKey(provider));
}
