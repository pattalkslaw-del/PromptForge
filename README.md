# PromptForge AI

Turn a rough idea (plus optional reference images) into a production-quality prompt using **xAI Grok**.

## Flow

1. Enter a draft idea / rough prompt and optional images
2. Grok generates clarifying questions
3. You answer
4. Grok synthesizes a master prompt with role, task, context, constraints, and output format

## Runtime

- Express server holds `XAI_API_KEY` (never sent to the browser)
- Model defaults to `grok-4.3` (`XAI_MODEL` overrides)
- Host port `3011` → container `3000`

## Environment

```
XAI_API_KEY=...
XAI_MODEL=grok-4.3
```

Loaded from `/home/patrick/.env` via docker compose `env_file`.