/**
 * xAI Grok client for PromptForge.
 */
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const MODEL = process.env.XAI_MODEL || "grok-4.3";

export function getModel() {
  return MODEL;
}

export function hasApiKey() {
  return Boolean(process.env.XAI_API_KEY && process.env.XAI_API_KEY.trim());
}

function getKey() {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) throw new Error("XAI_API_KEY is not set");
  return key;
}

function imageParts(images) {
  if (!Array.isArray(images)) return [];
  return images.slice(0, 5).map((img) => {
    const mime = img.mimeType || "image/jpeg";
    let url = img.base64 || "";
    if (!url.startsWith("data:")) {
      const bare = String(url).split(",").pop();
      url = `data:${mime};base64,${bare}`;
    }
    return { type: "image_url", image_url: { url } };
  });
}

function extractJSON(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Empty model response");
  }
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error("Model returned non-JSON content");
  }
}

async function chat({ system, userContent, schema, schemaName, temperature = 0.4 }) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userContent });

  const body = {
    model: MODEL,
    messages,
    temperature,
  };

  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schemaName || "result", strict: true, schema },
    };
  } else {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(XAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 400);
    try {
      const j = JSON.parse(raw);
      detail = j.error || j.message || detail;
    } catch {}
    throw new Error(`xAI API ${res.status}: ${detail}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("xAI returned invalid JSON envelope");
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("xAI returned an empty message");
  }
  return extractJSON(content);
}

const questionsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          context: { type: "string" },
        },
        required: ["id", "text", "context"],
      },
    },
  },
  required: ["questions"],
};

const resultSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enhancedPrompt: { type: "string" },
    explanation: { type: "string" },
    bestPracticesUsed: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["enhancedPrompt", "explanation", "bestPracticesUsed"],
};

export async function analyzePrompt(initialPrompt, images = []) {
  const system = `You are a senior prompt engineer. Your job is to interview the user so you can later write a world-class prompt.
Return ONLY structured JSON with 3-5 high-impact clarifying questions.
Each question needs: id (short slug), text (the question), context (why it matters).
Focus on: role/persona, goal, audience, tone, format/length, constraints, success criteria, and (if images are present) how visuals should influence the output.
Do not answer the user's request — only ask clarifying questions.`;

  const text = `User's initial draft/idea:
"""
${initialPrompt}
"""

${images.length ? `The user attached ${images.length} supporting image(s). Ask at least one question about visual style, details to emphasize/ignore, or how images should drive the final prompt.` : "No images were attached."}

Generate 3-5 clarifying questions.`;

  const userContent = [...imageParts(images), { type: "text", text }];
  const data = await chat({
    system,
    userContent,
    schema: questionsSchema,
    schemaName: "clarifying_questions",
    temperature: 0.5,
  });

  const questions = Array.isArray(data.questions) ? data.questions : [];
  return questions
    .filter((q) => q && typeof q.text === "string" && q.text.trim())
    .map((q, i) => ({
      id: String(q.id || `q${i + 1}`),
      text: String(q.text).trim(),
      context: String(q.context || "").trim(),
    }));
}

export async function synthesizePrompt(initialPrompt, questions, answers, images = []) {
  const interview = (questions || [])
    .map((q) => {
      const ans = (answers || []).find((a) => a.questionId === q.id)?.answer;
      return `Q: ${q.text}\nA: ${ans && String(ans).trim() ? String(ans).trim() : "(not provided)"}`;
    })
    .join("\n\n");

  const system = `You are an expert prompt engineer. Using the user's draft, optional images, and interview answers, write a single master prompt they can paste into any capable model.
Requirements for enhancedPrompt:
- Clear ROLE / PERSONA
- Precise TASK and GOAL
- CONTEXT the model needs
- CONSTRAINTS / rules
- OUTPUT FORMAT (structure the answer)
- Optional: evaluation checklist or chain-of-thought guidance when useful
- If images were provided, weave visual direction into the prompt text so it still works when images are attached alongside it
Also provide a short explanation of improvements, and list techniques used (e.g. role prompting, constraints, output schema, chain-of-thought, audience targeting).
Return structured JSON only.`;

  const text = `INITIAL DRAFT:
"""
${initialPrompt}
"""

INTERVIEW:
${interview || "(no interview answers)"}

Write the enhanced prompt now.`;

  const userContent = [...imageParts(images), { type: "text", text }];
  const data = await chat({
    system,
    userContent,
    schema: resultSchema,
    schemaName: "enhanced_prompt",
    temperature: 0.45,
  });

  if (!data.enhancedPrompt || !String(data.enhancedPrompt).trim()) {
    throw new Error("Model did not return an enhanced prompt");
  }

  return {
    enhancedPrompt: String(data.enhancedPrompt).trim(),
    explanation: String(data.explanation || "").trim(),
    bestPracticesUsed: Array.isArray(data.bestPracticesUsed)
      ? data.bestPracticesUsed.map(String)
      : [],
  };
}