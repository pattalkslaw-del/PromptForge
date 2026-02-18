


import { GoogleGenAI, Type } from "@google/genai";
import { PromptQuestion, PromptResult, UserAnswer, SupportingImage } from "../types";

// Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzePrompt = async (initialPrompt: string, images: SupportingImage[]): Promise<PromptQuestion[]> => {
  const imageParts = images.map(img => ({
    inlineData: {
      data: img.base64.split(',')[1],
      mimeType: img.mimeType
    }
  }));

  const textPart = {
    text: `Analyze this user's initial prompt and the provided supporting images. Determine what information is missing to make this a world-class, high-fidelity prompt.
    User's Initial Prompt: "${initialPrompt}"
    
    If images are provided, ask questions that clarify the visual style, specific details from the images, or how the images should influence the output.
    
    Generate 3-5 high-impact clarifying questions. Each question should aim to extract context, persona, tone, target audience, format, or constraints.`
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [...imageParts, textPart]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING, description: "The actual question for the user." },
                context: { type: Type.STRING, description: "Why this question matters for the prompt." }
              },
              required: ["id", "text", "context"]
            }
          }
        },
        required: ["questions"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text);
    return data.questions;
  } catch (e) {
    console.error("Failed to parse questions", e);
    return [];
  }
};

export const synthesizePrompt = async (
  initialPrompt: string, 
  questions: PromptQuestion[], 
  answers: UserAnswer[],
  images: SupportingImage[]
): Promise<PromptResult> => {
  const contextData = questions.map(q => {
    const ans = answers.find(a => a.questionId === q.id)?.answer || "Not provided";
    return `Question: ${q.text}\nAnswer: ${ans}`;
  }).join("\n\n");

  const imageParts = images.map(img => ({
    inlineData: {
      data: img.base64.split(',')[1],
      mimeType: img.mimeType
    }
  }));

  const textPart = {
    text: `You are an expert Prompt Engineer. Using the initial draft, the provided supporting images, and the interview context, create a highly effective, professional-grade prompt.
    
    INITIAL PROMPT: ${initialPrompt}
    
    INTERVIEW CONTEXT:
    ${contextData}
    
    INSTRUCTIONS:
    - Create a detailed prompt that includes Role, Task, Context, Constraints, and Output Format.
    - Reference the provided visual context from the images if applicable.
    - Provide a brief explanation of why this enhanced version is better.
    - List the specific prompt engineering techniques used (e.g., Chain of Thought, Few-shot, Role Prompting, etc.)`
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [...imageParts, textPart]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          enhancedPrompt: { type: Type.STRING },
          explanation: { type: Type.STRING },
          bestPracticesUsed: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["enhancedPrompt", "explanation", "bestPracticesUsed"]
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse synthesis result", e);
    throw new Error("Failed to generate the final prompt.");
  }
};
