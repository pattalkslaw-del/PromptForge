import React, { useState, useRef, useEffect } from "react";
import {
  AppStep,
  PromptQuestion,
  UserAnswer,
  PromptResult,
  SupportingImage,
  HistoryItem,
} from "./types";
import { analyzePrompt, synthesizePrompt } from "./services/api";

const HISTORY_KEY = "prompt_forge_history_v2";
const MAX_HISTORY = 40;

const Header: React.FC<{ onToggleHistory: () => void; historyCount: number }> = ({
  onToggleHistory,
  historyCount,
}) => (
  <header className="mb-12 text-center pt-8 relative">
    <div className="absolute right-0 top-8">
      <button
        onClick={onToggleHistory}
        className="glass p-3 rounded-2xl text-slate-400 hover:text-indigo-400 transition-all flex items-center space-x-2 group"
        title="History"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {historyCount > 0 && (
          <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full group-hover:bg-indigo-500">
            {historyCount}
          </span>
        )}
      </button>
    </div>
    <div className="inline-flex items-center justify-center p-3 mb-4 rounded-2xl bg-indigo-600/20 text-indigo-400 ring-1 ring-indigo-500/20">
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
    <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
      PromptForge AI
    </h1>
    <p className="text-slate-400 max-w-lg mx-auto text-lg">
      Turn raw ideas and visual references into master-class prompts with Grok.
    </p>
  </header>
);

function errMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
/** Works on HTTP (non-secure contexts) where crypto.randomUUID is unavailable. */
function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INITIAL);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [supportingImages, setSupportingImages] = useState<SupportingImage[]>([]);
  const [questions, setQuestions] = useState<PromptQuestion[]>([]);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [result, setResult] = useState<PromptResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch (e) {
      console.error("Failed to parse history", e);
    }
  }, []);

  const updateHistory = (next: HistoryItem[]) => {
    const trimmed = next.slice(0, MAX_HISTORY);
    setHistory(trimmed);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("Could not persist history", e);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remaining = 5 - supportingImages.length;
    Array.from(files)
      .slice(0, remaining)
      .forEach((file) => {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          setSupportingImages((prev) => [
            ...prev,
            { base64: reader.result as string, mimeType: file.type, name: file.name },
          ]);
        };
        reader.readAsDataURL(file);
      });
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setSupportingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartAnalysis = async () => {
    if (!initialPrompt.trim()) return;
    setError(null);
    setStep(AppStep.ANALYZING);
    try {
      const qs = await analyzePrompt(initialPrompt.trim(), supportingImages);
      if (!qs.length) {
        throw new Error("No clarifying questions came back. Try a slightly richer draft.");
      }
      setQuestions(qs);
      setAnswers(qs.map((q) => ({ questionId: q.id, answer: "" })));
      setStep(AppStep.QUESTIONS);
    } catch (err) {
      setError(errMessage(err, "Analysis failed. Please try again."));
      setStep(AppStep.INITIAL);
    }
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === questionId);
      if (existing) {
        return prev.map((a) => (a.questionId === questionId ? { ...a, answer } : a));
      }
      return [...prev, { questionId, answer }];
    });
  };

  const handleSynthesize = async () => {
    setError(null);
    setStep(AppStep.SYNTHESIZING);
    try {
      const res = await synthesizePrompt(
        initialPrompt.trim(),
        questions,
        answers,
        supportingImages
      );
      setResult(res);
      setStep(AppStep.RESULT);
      const item: HistoryItem = {
        id: newId(),
        timestamp: Date.now(),
        initialPrompt: initialPrompt.trim(),
        result: res,
        imageNames: supportingImages.map((i) => i.name),
      };
      updateHistory([item, ...history]);
    } catch (err) {
      setError(errMessage(err, "Failed to synthesize the final prompt."));
      setStep(AppStep.QUESTIONS);
    }
  };

  const reusePrompt = (item: HistoryItem) => {
    setInitialPrompt(item.result.enhancedPrompt);
    setSupportingImages([]);
    setResult(null);
    setAnswers([]);
    setQuestions([]);
    setError(null);
    setStep(AppStep.INITIAL);
    setIsHistoryOpen(false);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateHistory(history.filter((item) => item.id !== id));
  };

  const clearHistory = () => {
    if (confirm("Clear all history?")) updateHistory([]);
  };

  const reset = () => {
    setStep(AppStep.INITIAL);
    setInitialPrompt("");
    setSupportingImages([]);
    setQuestions([]);
    setAnswers([]);
    setResult(null);
    setError(null);
    setCopied(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy — select the text manually.");
    }
  };

  const answeredCount = answers.filter((a) => a.answer.trim()).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 relative">
      <Header onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)} historyCount={history.length} />

      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md glass border-l border-slate-700/50 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Generation History</h2>
              <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {history.length === 0 ? (
                <p className="text-center py-20 text-slate-500">No prompts forged yet.</p>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="glass p-4 rounded-2xl border border-slate-700/30 hover:border-indigo-500/50 transition-all cursor-pointer"
                    onClick={() => reusePrompt(item)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] uppercase tracking-widest text-slate-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                      <button onClick={(e) => deleteHistoryItem(item.id, e)} className="text-slate-600 hover:text-red-400">
                        Delete
                      </button>
                    </div>
                    <p className="text-sm text-slate-300 font-medium line-clamp-2 mb-3">{item.initialPrompt}</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(item.result.enhancedPrompt); }}
                        className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded-lg"
                      >
                        Copy Result
                      </button>
                      <span className="text-xs text-slate-500 px-2 py-1">Reuse as base</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {history.length > 0 && (
              <div className="p-6 border-t border-slate-700/50">
                <button onClick={clearHistory} className="w-full py-2 text-sm text-slate-500 hover:text-red-400">
                  Clear All History
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center whitespace-pre-wrap">
          {error}
        </div>
      )}

      {step === AppStep.INITIAL && (
        <div className="space-y-6">
          <div className="glass p-8 rounded-3xl">
            <label className="block text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
              1. Your initial idea or draft
            </label>
            <textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="e.g., Write a blog post about coffee..."
              className="w-full h-48 bg-slate-900/50 border border-slate-700 rounded-2xl p-4 text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 text-lg mb-8"
            />

            <label className="block text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
              2. Supporting images (optional, max 5)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-4">
              {supportingImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square group rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
                  <img src={img.base64} alt={img.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {supportingImages.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-indigo-500/5 transition-all text-slate-500 hover:text-indigo-400"
                >
                  <span className="text-2xl mb-1">+</span>
                  <span className="text-xs font-medium">Add Image</span>
                </button>
              )}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />

            <div className="mt-12 flex justify-center">
              <button
                onClick={handleStartAnalysis}
                disabled={!initialPrompt.trim()}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all shadow-xl shadow-indigo-500/20 flex items-center space-x-2"
              >
                <span>Analyze &amp; Enhance</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === AppStep.ANALYZING && (
        <div className="flex flex-col items-center justify-center space-y-6 py-20">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-xl text-slate-300 font-medium">Deconstructing your request…</p>
            <p className="text-sm text-slate-500 mt-2">Grok is drafting clarifying questions</p>
          </div>
        </div>
      )}

      {step === AppStep.QUESTIONS && (
        <div className="space-y-6">
          <div className="glass p-8 rounded-3xl">
            <h2 className="text-2xl font-bold mb-2 flex items-center">
              <span className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-sm mr-3 text-white">2</span>
              Refine the details
            </h2>
            <p className="text-slate-500 text-sm mb-8">
              Answer what you can — blank answers are fine. Better answers → better final prompt.
            </p>
            <div className="space-y-8">
              {questions.map((q) => (
                <div key={q.id} className="space-y-3">
                  <h3 className="text-slate-200 font-semibold text-lg">{q.text}</h3>
                  {q.context && <p className="text-sm text-slate-500 italic">{q.context}</p>}
                  <input
                    type="text"
                    value={answers.find((a) => a.questionId === q.id)?.answer || ""}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="Your answer…"
                  />
                </div>
              ))}
            </div>
            <div className="mt-12 flex justify-between items-center pt-8 border-t border-slate-700/50">
              <button onClick={reset} className="text-slate-400 hover:text-white transition-colors">Start Over</button>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500">{answeredCount}/{questions.length} answered</span>
                <button
                  onClick={handleSynthesize}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg"
                >
                  Generate Final Prompt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === AppStep.SYNTHESIZING && (
        <div className="flex flex-col items-center justify-center space-y-6 py-20">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-xl text-slate-300 font-medium">Assembling your master prompt…</p>
            <p className="text-sm text-slate-500 mt-2">Role, task, constraints, output format</p>
          </div>
        </div>
      )}

      {step === AppStep.RESULT && result && (
        <div className="space-y-8">
          <div className="glass p-8 rounded-3xl border-indigo-500/30 ring-4 ring-indigo-500/10">
            <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
              <h2 className="text-2xl font-bold text-indigo-400">Your Forge Prompt</h2>
              <button
                onClick={() => copyToClipboard(result.enhancedPrompt)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl hover:bg-indigo-600/30 transition-all text-sm font-medium"
              >
                <span>{copied ? "Copied!" : "Copy to Clipboard"}</span>
              </button>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 font-mono text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner text-sm">
              {result.enhancedPrompt}
            </div>
            <div className="mt-8 grid md:grid-cols-2 gap-8 pt-8 border-t border-slate-700/50">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Why this works</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{result.explanation}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Techniques applied</h3>
                <ul className="grid grid-cols-1 gap-2">
                  {result.bestPracticesUsed.map((practice, idx) => (
                    <li key={idx} className="flex items-center text-sm text-slate-400">
                      <span className="text-green-500 mr-2">✓</span>
                      {practice}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-12 flex justify-center space-x-4 flex-wrap gap-3">
              <button onClick={reset} className="px-10 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all border border-slate-700">
                Start New Project
              </button>
              <button
                onClick={() => {
                  setInitialPrompt(result.enhancedPrompt);
                  setResult(null);
                  setQuestions([]);
                  setAnswers([]);
                  setSupportingImages([]);
                  setStep(AppStep.INITIAL);
                }}
                className="px-10 py-3 glass hover:bg-white/5 text-slate-300 rounded-xl transition-all"
              >
                Iterate on this prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;