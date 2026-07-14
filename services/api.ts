import { PromptQuestion, PromptResult, UserAnswer, SupportingImage } from "../types";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text.slice(0, 200) || `Request failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function analyzePrompt(
  initialPrompt: string,
  images: SupportingImage[]
): Promise<PromptQuestion[]> {
  const data = await postJSON<{ questions: PromptQuestion[] }>("/api/analyze", {
    initialPrompt,
    images,
  });
  return data.questions || [];
}

export async function synthesizePrompt(
  initialPrompt: string,
  questions: PromptQuestion[],
  answers: UserAnswer[],
  images: SupportingImage[]
): Promise<PromptResult> {
  return postJSON<PromptResult>("/api/synthesize", {
    initialPrompt,
    questions,
    answers,
    images,
  });
}