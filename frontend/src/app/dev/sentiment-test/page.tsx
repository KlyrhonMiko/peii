"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, AlertCircle, ArrowRight, BrainCircuit } from "lucide-react";

export default function SentimentTestPage() {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ label: string; score: number; sentiment_score: number; model: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeSentiment = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("http://localhost:8000/api/v1/ml/sentiment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.detail || "Failed to analyze sentiment");
      }

      setResult(data.data);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const getSentimentColor = (label: string) => {
    switch (label.toUpperCase()) {
      case "POSITIVE":
      case "LABEL_1":
      case "LABEL_2":
        return "text-emerald-700 bg-emerald-50 border-emerald-200";
      case "NEGATIVE":
      case "LABEL_0":
        return "text-rose-700 bg-rose-50 border-rose-200";
      case "NEUTRAL":
        return "text-amber-700 bg-amber-50 border-amber-200";
      default:
        return "text-slate-700 bg-slate-50 border-slate-200";
    }
  };

  const getSentimentEmoji = (label: string) => {
    switch (label.toUpperCase()) {
      case "POSITIVE":
      case "LABEL_1":
      case "LABEL_2":
        return "😊";
      case "NEGATIVE":
      case "LABEL_0":
        return "😔";
      case "NEUTRAL":
        return "😐";
      default:
        return "🤔";
    }
  };

  return (
    <div className="relative min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-600 selection:text-white overflow-hidden flex flex-col items-center py-20 px-6">
      {/* Subtle background texture */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-bl from-indigo-50/80 via-blue-50/40 to-transparent rounded-full translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-slate-100/60 via-indigo-50/30 to-transparent rounded-full -translate-x-1/4 translate-y-1/4" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-3xl w-full space-y-10">

        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-lg shadow-indigo-600/15 mb-2">
            <BrainCircuit className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
            Sentiment <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-500">Analysis.</span>
          </h1>
          <p className="text-slate-400 text-[15px] max-w-lg mx-auto leading-relaxed">
            Test our locally running RoBERTa language model. Enter a Tagalog sentence below to analyze its emotional sentiment.
          </p>
        </div>

        {/* Interactive Card */}
        <Card className="bg-white/80 border-slate-200/80 shadow-xl shadow-slate-200/50 backdrop-blur-md rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-5">
            <CardTitle className="text-slate-900 text-lg">Text Input</CardTitle>
            <CardDescription className="text-slate-500">
              Type or paste Tagalog text (e.g. "Ang ganda ng serbisyo!")
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter Tagalog text here..."
                className="w-full min-h-[160px] p-4 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all outline-none text-slate-700 placeholder:text-slate-400 resize-y text-[15px] leading-relaxed shadow-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    analyzeSentiment();
                  }
                }}
              />

              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 animate-in fade-in zoom-in-95 duration-300">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm font-medium">{error}</div>
                </div>
              )}

              {result && !error && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
                  <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center gap-8">

                    {/* Top Stats */}
                    <div className="flex w-full justify-between items-end">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sentiment Score</p>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-4xl font-extrabold tracking-tight ${result.sentiment_score > 0 ? 'text-emerald-600' : result.sentiment_score < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                            {result.sentiment_score > 0 ? '+' : ''}{result.sentiment_score.toFixed(3)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Classification</p>
                        <div className={`inline-flex px-3 py-1 rounded-md text-[13px] font-semibold tracking-wide ${getSentimentColor(result.label)}`}>
                          {result.label}
                        </div>
                      </div>
                    </div>

                    {/* Scale Visualization */}
                    <div className="w-full space-y-3">
                      <div className="relative h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        {/* Center line marker */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-400/50 z-10" />

                        {/* The Fill Bar */}
                        <div
                          className={`absolute top-0 bottom-0 transition-all duration-1000 ease-out ${result.sentiment_score > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          style={{
                            left: result.sentiment_score > 0 ? '50%' : `${50 + (result.sentiment_score * 50)}%`,
                            width: `${Math.abs(result.sentiment_score) * 50}%`
                          }}
                        />
                      </div>

                      {/* Scale Labels */}
                      <div className="flex justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <span>Negative (-1)</span>
                        <span>Neutral (0)</span>
                        <span>Positive (+1)</span>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="w-full pt-4 border-t border-slate-200/60 flex justify-between items-center text-[12px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <BrainCircuit className="w-3.5 h-3.5" />
                        <span>{result.model}</span>
                      </div>
                      <span>Confidence: <strong className="text-slate-700">{(result.score * 100).toFixed(1)}%</strong></span>
                    </div>

                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center bg-slate-50/80 border-t border-slate-100 px-6 py-4">
            <div className="text-[13px] text-slate-400 flex items-center gap-2 font-medium">
              <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 shadow-sm rounded text-[11px] text-slate-500 font-sans font-bold">
                ⌘ Enter
              </kbd>
              <span className="hidden md:inline">to submit</span>
            </div>
            <Button
              onClick={analyzeSentiment}
              disabled={isLoading || !text.trim()}
              className="h-10 px-6 text-[13px] bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all hover:shadow-indigo-600/30 rounded-lg font-semibold group active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze Sentiment
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
