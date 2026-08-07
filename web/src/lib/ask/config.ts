import { z } from "zod";

const modelIdSchema = z.string().trim().min(3).max(160).regex(/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i);

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type AskServerConfig = {
  enabled: boolean;
  available: boolean;
  unavailableReason: "disabled" | "missing-configuration" | null;
  modelId: string;
  openRouterApiKey?: string;
  sessionSecret?: string;
  metabaseInternalUrl?: string;
  metabaseApiKey?: string;
  metabaseDatabaseName: string;
  windowLimit: number;
  dailyLimit: number;
  windowMs: number;
};

export function getAskServerConfig(env: NodeJS.ProcessEnv = process.env): AskServerConfig {
  const enabled = env.AI_CHAT_ENABLED === "true";
  const parsedModel = modelIdSchema.safeParse(env.AI_MODEL ?? "deepseek/deepseek-v4-flash-0731");
  const openRouterApiKey = env.OPENROUTER_API_KEY?.trim();
  const sessionSecret = env.AI_SESSION_SECRET?.trim();
  const metabaseInternalUrl = env.METABASE_INTERNAL_URL?.trim().replace(/\/$/, "");
  const metabaseApiKey = env.METABASE_AGENT_API_KEY?.trim();
  const complete = Boolean(
    parsedModel.success &&
    openRouterApiKey &&
    sessionSecret && sessionSecret.length >= 32 &&
    metabaseInternalUrl &&
    metabaseApiKey,
  );

  return {
    enabled,
    available: enabled && complete,
    unavailableReason: !enabled ? "disabled" : complete ? null : "missing-configuration",
    modelId: parsedModel.success ? parsedModel.data : "deepseek/deepseek-v4-flash-0731",
    openRouterApiKey,
    sessionSecret,
    metabaseInternalUrl,
    metabaseApiKey,
    metabaseDatabaseName: env.METABASE_AGENT_DATABASE_NAME?.trim() || "Restless Pacific Analytics",
    windowLimit: positiveInteger(env.AI_RATE_LIMIT_10_MINUTES, 10),
    dailyLimit: positiveInteger(env.AI_RATE_LIMIT_DAILY, 50),
    windowMs: positiveInteger(env.AI_RATE_WINDOW_MS, 10 * 60 * 1000),
  };
}

export function publicAskAvailability(env: NodeJS.ProcessEnv = process.env) {
  const config = getAskServerConfig(env);
  return { available: config.available, reason: config.unavailableReason };
}
