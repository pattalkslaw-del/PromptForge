
export enum AppStep {
  INITIAL = 'INITIAL',
  ANALYZING = 'ANALYZING',
  QUESTIONS = 'QUESTIONS',
  SYNTHESIZING = 'SYNTHESIZING',
  RESULT = 'RESULT'
}

export interface PromptQuestion {
  id: string;
  text: string;
  context: string;
}

export interface UserAnswer {
  questionId: string;
  answer: string;
}

export interface PromptResult {
  enhancedPrompt: string;
  explanation: string;
  bestPracticesUsed: string[];
}

export interface SupportingImage {
  base64: string;
  mimeType: string;
  name: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  initialPrompt: string;
  result: PromptResult;
  images: SupportingImage[];
}
