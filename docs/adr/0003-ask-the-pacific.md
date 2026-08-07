# ADR 0003: Add a bounded Next.js geology agent over governed data

- Status: Accepted, feature-flagged
- Date: 2026-08-06
- Decision owners: Restless Pacific maintainers

## Context

Restless Pacific already exposes a provenance-aware Atlas, a reproducible
Ringmaker comparison, and four published Metabase dashboards. A conversational
guide can make those contracts easier to explore, but a public anonymous agent
must not become a raw SQL proxy, a content-creation surface, an unbounded web
researcher, or a source of hazard forecasts.

## Decision

- Add `/ask` and `POST /api/ask` to the existing Next.js application.
- Use the Vercel AI SDK tool-loop agent with a maximum of six steps, four data
  tool executions, 45 seconds, and no automatic model fallback.
- Pin `deepseek/deepseek-v4-flash-0731` through OpenRouter while keeping the
  model ID server-configurable for explicit evaluation deployments.
- Use official AI Elements transcript primitives and json-render inline mode.
  The project owns an eight-component catalog; components receive server-issued
  result IDs rather than model-authored data arrays.
- Upgrade the tested Metabase image to `v0.63.5` and use its Agent API with a
  separate `Ring AI Reader` API-key group. Next.js exposes only search,
  inspection, and constrained portable-query construction over the five
  `analytics` views. Raw SQL and every Metabase write endpoint are absent.
- Continue to use signed guest embeds for the four pre-published dashboards.
- Keep at most 30 display messages in schema-versioned browser storage for seven
  days. The server does not persist transcripts and strips client history down
  to the latest twelve user/assistant text messages.
- Issue an HMAC-signed HttpOnly anonymous cookie, combine its hash with a hashed
  forwarded IP, and enforce one active request, ten requests per ten minutes,
  and fifty per day in process memory.
- Log identifiers, latency, model, token counts, tool names, row counts, status,
  and normalized errors only. Do not log prompts, answers, raw IPs, cookies, or
  tool payloads.
- Keep `AI_CHAT_ENABLED=false` until the Metabase backup/migration, restricted
  permissions, model comparison, browser suite, and full-stack smoke tests pass.

## Scientific and safety constraints

The agent distinguishes observations from explanation, preserves missingness
and source caveats, does not infer causation from proximity, and never describes
the Restless Pacific rule as scientific truth. It gives no hazard forecast or
invented emergency instructions; current-risk questions are directed to
responsible local authorities and official warning centers.

## Consequences

The v1 runtime is stateless enough that Eve would add durability and channel
complexity without a product benefit. Agent instructions and tools remain
modular so a later persistent or multi-channel release can move to Eve. The
in-memory limiter is intentionally per-process; a multi-instance deployment
must replace it with an atomic shared limiter before enabling the feature.

An unavailable model or Metabase dependency fails closed while the Journey,
Atlas, Ringmaker, Sourcebook, and existing Data Lab remain healthy.
