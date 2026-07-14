// PromptForge model layer: xAI Grok (grok-4.3), OpenAI-compatible chat completions.
// Ported from the original Gemini geminiService.ts. Exported signatures are unchanged
// so App.tsx needs no edits.

import { PromptQuestion, PromptResult, UserAnswer, SupportingImage } from "../types";

const XAI_URL = "/xai/v1/chat/completions"; // same-origin; Vite dev proxy injects the key
const MODEL = "grok-4.3";

type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function imageContentParts(images: SupportingImage[]): ChatContent[] {
  return images.map((img) => {
    // img.base64 may be a full data URL or a bare base64 payload; normalize to a data URL.
    const url = img.base64.startsWith("data:")
      ? img.base64
      : `data:${img.mimeType};base64,${img.base64.split(",").pop()}`;
    return { type: "image_url", image_url: { url } };
  });
}

async function chatJSON(
  userContent: ChatContent[],
  schema: Record<string, unknown>,
  schemaName: string,
  systemMsg?: string
): Promise<any> {
  const messages: Array<Record<string, unknown>> = [];
  if (systemMsg) messages.push({ role: "system", content: systemMsg });
  messages.push({ role: "user", content: userContent });

  const res = await fetch(XAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Grok API error (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("The AI returned an empty response.");
  }
  return JSON.parse(text);
}

export const analyzePrompt = async (
  initialPrompt: string,
  images: SupportingImage[]
): Promise<PromptQuestion[]> => {
  const textPart: ChatContent = {
    type: "text",
    text: `Analyze this user's initial prompt and the provided supporting images. Determine what information is missing to make this a world-class, high-fidelity prompt.
    User's Initial Prompt: "${initialPrompt}"

    If images are provided, ask questions that clarify the visual style, specific details from the images, or how the images should influence the output.

    Generate 3-5 high-impact clarifying questions. Each question should aim to extract context, persona, tone, target audience, format, or constraints.`,
  };

  const schema = {
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
            text: { type: "string", description: "The actual question for the user." },
            context: { type: "string", description: "Why this question matters for the prompt." },
          },
          required: ["id", "text", "context"],
        },
      },
    },
    required: ["questions"],
  };

  try {
    const data = await chatJSON([...imageContentParts(images), textPart], schema, "clarifying_questions");
    return data.questions ?? [];
  } catch (e) {
    console.error("Failed to analyze prompt", e);
    return [];
  }
};

export const synthesizePrompt = async (
  initialPrompt: string,
  questions: PromptQuestion[],
  answers: UserAnswer[],
  images: SupportingImage[]
): Promise<PromptResult> => {
  const contextData = questions
    .map((q) => {
      const ans = answers.find((a) => a.questionId === q.id)?.answer || "Not provided";
      return `Question: ${q.text}\nAnswer: ${ans}`;
    })
    .join("\n\n");

  const textPart: ChatContent = {
    type: "text",
    text: `You are an expert Prompt Engineer. Using the initial draft, the provided supporting images, and the interview context, create a highly effective, professional-grade prompt.

    INITIAL PROMPT: ${initialPrompt}

    INTERVIEW CONTEXT:
    ${contextData}

    INSTRUCTIONS:
    - Create a detailed prompt that includes Role, Task, Context, Constraints, and Output Format.
    - Reference the provided visual context from the images if applicable.
    - Provide a brief explanation of why this enhanced version is better.
    - List the specific prompt engineering techniques used (e.g., Chain of Thought, Few-shot, Role Prompting, etc.)`,
  };

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      enhancedPrompt: { type: "string" },
      explanation: { type: "string" },
      bestPracticesUsed: { type: "array", items: { type: "string" } },
    },
    required: ["enhancedPrompt", "explanation", "bestPracticesUsed"],
  };

  return chatJSON([...imageContentParts(images), textPart], schema, "enhanced_prompt");
};
