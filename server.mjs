/**
 * PromptForge server — XAI_API_KEY stays server-side only.
 */
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { analyzePrompt, synthesizePrompt, getModel, hasApiKey } from "./services/xai.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "promptforge",
    model: getModel(),
    hasKey: hasApiKey(),
  });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { initialPrompt, images = [] } = req.body || {};
    if (!initialPrompt || typeof initialPrompt !== "string" || !initialPrompt.trim()) {
      return res.status(400).json({ error: "initialPrompt is required" });
    }
    if (!hasApiKey()) {
      return res.status(500).json({ error: "XAI_API_KEY is not configured on the server" });
    }
    const questions = await analyzePrompt(initialPrompt.trim(), Array.isArray(images) ? images : []);
    if (!questions.length) {
      return res.status(502).json({ error: "Model returned no clarifying questions. Try again." });
    }
    res.json({ questions });
  } catch (err) {
    console.error("analyze error:", err);
    res.status(502).json({ error: err?.message || "Analysis failed" });
  }
});

app.post("/api/synthesize", async (req, res) => {
  try {
    const { initialPrompt, questions = [], answers = [], images = [] } = req.body || {};
    if (!initialPrompt || typeof initialPrompt !== "string" || !initialPrompt.trim()) {
      return res.status(400).json({ error: "initialPrompt is required" });
    }
    if (!hasApiKey()) {
      return res.status(500).json({ error: "XAI_API_KEY is not configured on the server" });
    }
    const result = await synthesizePrompt(
      initialPrompt.trim(),
      Array.isArray(questions) ? questions : [],
      Array.isArray(answers) ? answers : [],
      Array.isArray(images) ? images : []
    );
    res.json(result);
  } catch (err) {
    console.error("synthesize error:", err);
    res.status(502).json({ error: err?.message || "Synthesis failed" });
  }
});

async function start() {
  if (isProd) {
    const dist = path.join(__dirname, "dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: __dirname,
      server: { middlewareMode: true, host: "0.0.0.0" },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PromptForge listening on :${PORT} (${isProd ? "production" : "dev"})`);
    console.log(`Model: ${getModel()}  key configured: ${hasApiKey()}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});