
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, PromptQuestion, UserAnswer, PromptResult, SupportingImage, HistoryItem } from './types';
import { analyzePrompt, synthesizePrompt } from './services/geminiService';

// Layout Components
const Header: React.FC<{ onToggleHistory: () => void; historyCount: number }> = ({ onToggleHistory, historyCount }) => (
  <header className="mb-12 text-center pt-8 relative">
    <div className="absolute right-0 top-8">
      <button
        onClick={onToggleHistory}
        className="glass p-3 rounded-2xl text-slate-400 hover:text-indigo-400 transition-all flex items-center space-x-2 group"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
    <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
      PromptForge AI
    </h1>
    <p className="text-slate-400 max-w-lg mx-auto text-lg">
      Transform raw ideas and visual references into master-class prompts through multi-modal intelligence.
    </p>
  </header>
);

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INITIAL);
  const [initialPrompt, setInitialPrompt] = useState('');
  const [supportingImages, setSupportingImages] = useState<SupportingImage[]>([]);
  const [questions, setQuestions] = useState<PromptQuestion[]>([]);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [result, setResult] = useState<PromptResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('prompt_forge_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage
  const updateHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem('prompt_forge_history', JSON.stringify(newHistory));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = 5 - supportingImages.length;
    const newFiles = Array.from(files).slice(0, remainingSlots) as File[];

    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSupportingImages(prev => [...prev, {
          base64: reader.result as string,
          mimeType: file.type,
          name: file.name
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setSupportingImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartAnalysis = async () => {
    if (!initialPrompt.trim()) return;
    setError(null);
    setStep(AppStep.ANALYZING);
    try {
      const qs = await analyzePrompt(initialPrompt, supportingImages);
      setQuestions(qs);
      setStep(AppStep.QUESTIONS);
    } catch (err) {
      setError('Something went wrong during analysis. Please try again.');
      setStep(AppStep.INITIAL);
    }
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => {
      const existing = prev.find(a => a.questionId === questionId);
      if (existing) {
        return prev.map(a => a.questionId === questionId ? { ...a, answer } : a);
      }
      return [...prev, { questionId, answer }];
    });
  };

  const handleSynthesize = async () => {
    setError(null);
    setStep(AppStep.SYNTHESIZING);
    try {
      const res = await synthesizePrompt(initialPrompt, questions, answers, supportingImages);
      setResult(res);
      setStep(AppStep.RESULT);
      
      // Add to history
      const newHistoryItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        initialPrompt,
        result: res,
        images: supportingImages
      };
      updateHistory([newHistoryItem, ...history]);
    } catch (err) {
      setError('Failed to synthesize the final prompt. Please check your answers.');
      setStep(AppStep.QUESTIONS);
    }
  };

  const reusePrompt = (item: HistoryItem) => {
    setInitialPrompt(item.result.enhancedPrompt);
    setSupportingImages(item.images || []);
    setResult(null);
    setAnswers([]);
    setQuestions([]);
    setStep(AppStep.INITIAL);
    setIsHistoryOpen(false);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateHistory(history.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    if (confirm("Are you sure you want to clear all history?")) {
      updateHistory([]);
    }
  };

  const reset = () => {
    setStep(AppStep.INITIAL);
    setInitialPrompt('');
    setSupportingImages([]);
    setQuestions([]);
    setAnswers([]);
    setResult(null);
    setError(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Simple alert-less feedback could be added here, but keeping consistent
    alert('Copied to clipboard!');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 relative">
      <Header onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)} historyCount={history.length} />

      {/* History Sidebar/Drawer */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setIsHistoryOpen(false)}></div>
          <div className="absolute right-0 top-0 h-full w-full max-w-md glass border-l border-slate-700/50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center">
                <svg className="w-5 h-5 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Generation History
              </h2>
              <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-slate-500">No prompts forged yet.</p>
                </div>
              ) : (
                history.map((item) => (
                  <div 
                    key={item.id} 
                    className="glass p-4 rounded-2xl border border-slate-700/30 hover:border-indigo-500/50 transition-all cursor-pointer group"
                    onClick={() => reusePrompt(item)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] uppercase tracking-widest text-slate-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                      <button 
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-sm text-slate-300 font-medium line-clamp-2 mb-3">
                      {item.initialPrompt}
                    </p>
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(item.result.enhancedPrompt); }}
                        className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded-lg hover:bg-indigo-500/20 transition-all"
                      >
                        Copy Result
                      </button>
                      <button
                        className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-lg hover:text-white transition-all"
                      >
                        Reuse Base
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {history.length > 0 && (
              <div className="p-6 border-t border-slate-700/50">
                <button 
                  onClick={clearHistory}
                  className="w-full py-2 text-sm text-slate-500 hover:text-red-400 transition-colors flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Clear All History</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center">
          {error}
        </div>
      )}

      {/* STEP: INITIAL INPUT */}
      {step === AppStep.INITIAL && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="glass p-8 rounded-3xl">
            <label className="block text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
              1. Your Initial Idea or Draft
            </label>
            <textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="e.g., Write a blog post about coffee..."
              className="w-full h-48 bg-slate-900/50 border border-slate-700 rounded-2xl p-4 text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 text-lg mb-8"
            />

            <label className="block text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
              2. Supporting Images (Optional, max 5)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-4">
              {supportingImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square group rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
                  <img src={img.base64} alt={img.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {supportingImages.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-indigo-500/5 transition-all text-slate-500 hover:text-indigo-400"
                >
                  <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs font-medium">Add Image</span>
                </button>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              multiple
              className="hidden"
            />

            <div className="mt-12 flex justify-center">
              <button
                onClick={handleStartAnalysis}
                disabled={!initialPrompt.trim()}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all shadow-xl shadow-indigo-500/20 flex items-center space-x-2"
              >
                <span>Analyze & Enhance</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP: ANALYZING LOADING */}
      {step === AppStep.ANALYZING && (
        <div className="flex flex-col items-center justify-center space-y-6 py-20 animate-pulse">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center">
            <p className="text-xl text-slate-300 font-medium">Deconstructing your request...</p>
            <p className="text-sm text-slate-500 mt-2">Processing text and visual context</p>
          </div>
        </div>
      )}

      {/* STEP: QUESTIONS */}
      {step === AppStep.QUESTIONS && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="glass p-8 rounded-3xl">
            <h2 className="text-2xl font-bold mb-8 flex items-center">
              <span className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-sm mr-3 text-white">2</span>
              Let's Refine the Details
            </h2>
            <div className="space-y-8">
              {questions.map((q) => (
                <div key={q.id} className="space-y-3">
                  <div className="flex justify-between items-start">
                    <h3 className="text-slate-200 font-semibold text-lg">{q.text}</h3>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">Required</span>
                  </div>
                  <p className="text-sm text-slate-500 italic mb-2">{q.context}</p>
                  <input
                    type="text"
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="Enter your details here..."
                  />
                </div>
              ))}
            </div>
            <div className="mt-12 flex justify-between items-center pt-8 border-t border-slate-700/50">
              <button onClick={reset} className="text-slate-400 hover:text-white transition-colors">Start Over</button>
              <button
                onClick={handleSynthesize}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                Generate Final Prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP: SYNTHESIZING LOADING */}
      {step === AppStep.SYNTHESIZING && (
        <div className="flex flex-col items-center justify-center space-y-6 py-20">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="text-center">
            <p className="text-xl text-slate-300 font-medium">Assembling your master prompt...</p>
            <p className="text-sm text-slate-500 mt-2">Integrating context, constraints, and visual personas</p>
          </div>
        </div>
      )}

      {/* STEP: RESULT */}
      {step === AppStep.RESULT && result && (
        <div className="space-y-8 animate-in zoom-in-95 fade-in duration-700">
          <div className="glass p-8 rounded-3xl border-indigo-500/30 ring-4 ring-indigo-500/10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-indigo-400">Your Forge Prompt</h2>
              <button
                onClick={() => copyToClipboard(result.enhancedPrompt)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl hover:bg-indigo-600/30 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <span>Copy to Clipboard</span>
              </button>
            </div>
            
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-6 font-mono text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner">
              {result.enhancedPrompt}
            </div>

            <div className="mt-8 grid md:grid-cols-2 gap-8 pt-8 border-t border-slate-700/50">
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Why this works</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{result.explanation}</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Techniques Applied</h3>
                <ul className="grid grid-cols-1 gap-2">
                  {result.bestPracticesUsed.map((practice, idx) => (
                    <li key={idx} className="flex items-center text-sm text-slate-400">
                      <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {practice}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-12 flex justify-center space-x-4">
              <button
                onClick={reset}
                className="px-10 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all border border-slate-700"
              >
                Start New Project
              </button>
              <button
                onClick={() => setIsHistoryOpen(true)}
                className="px-10 py-3 glass hover:bg-white/5 text-slate-300 rounded-xl transition-all"
              >
                View History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
