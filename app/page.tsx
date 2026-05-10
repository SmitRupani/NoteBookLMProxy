"use client";

import { useState } from "react";

export default function Home() {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setIsIndexed(true);
      } else {
        alert("Error: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to upload document.");
    } finally {
      setIsUploading(false);
      e.target.value = ""; // reset
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [...prev, { role: "ai", content: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "ai", content: "Error: " + data.error }]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { role: "ai", content: "Failed to fetch response." }]);
    } finally {
      setIsThinking(false);
    }
  };

  // Welcome / Upload Screen
  if (!isIndexed) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 font-sans text-zinc-100 p-6">
        <div className="max-w-xl w-full flex flex-col items-center text-center space-y-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-100 mb-4">
              Welcome to <span className="text-orange-500">NotebookLM</span>
            </h1>
            <p className="text-lg text-zinc-400">
              Upload a document to begin a single-document chat session.
            </p>
          </div>

          <div className="w-full">
            {isUploading ? (
              <div className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-orange-900/50 rounded-2xl bg-zinc-900/50 backdrop-blur-sm">
                <svg className="w-12 h-12 mb-4 text-orange-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <p className="text-xl font-medium text-orange-500 animate-pulse">Indexing Document...</p>
                <p className="text-sm text-zinc-500 mt-2">This might take a few moments</p>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-zinc-800 rounded-2xl cursor-pointer bg-zinc-900/30 hover:bg-zinc-900/80 hover:border-orange-500/50 transition-all group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex flex-col items-center justify-center pt-5 pb-6 relative z-10">
                  <div className="p-4 rounded-full bg-zinc-900 mb-4 group-hover:scale-110 transition-transform">
                    <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-lg text-zinc-300 font-medium mb-1">
                    <span className="text-orange-500">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-sm text-zinc-500">PDF documents only</p>
                </div>
                <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
              </label>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Chat Interface
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-orange-500/30">
      <header className="h-16 border-b border-zinc-800/80 flex items-center justify-center px-6 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20">
        <h2 className="text-lg font-medium tracking-wide">
          <span className="text-orange-500 font-semibold">Notebook</span> Chat
        </h2>
      </header>

      <main className="flex-1 overflow-y-auto w-full">
        <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 min-h-full flex flex-col justify-end">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center mb-6 shadow-xl border border-zinc-800">
                <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-zinc-200 mb-2">Document Indexed</h3>
              <p className="text-zinc-500 max-w-sm">
                Your document is ready. Ask anything about the contents and the AI will analyze it for you.
              </p>
            </div>
          ) : (
            <div className="space-y-6 pb-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div 
                    className={`max-w-[85%] md:max-w-[75%] px-5 py-4 rounded-2xl shadow-sm ${
                      msg.role === "user" 
                        ? "bg-orange-600 text-zinc-50 rounded-br-sm" 
                        : "bg-white/5 backdrop-blur-sm border border-white/10 text-zinc-200 rounded-bl-sm"
                    }`}
                  >
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              
              {isThinking && (
                <div className="flex justify-start">
                  <div className="bg-white/5 backdrop-blur-sm border border-white/10 text-orange-500 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-3 shadow-sm">
                    <span className="text-sm font-medium tracking-wide animate-pulse">Thinking</span>
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <div className="p-4 md:p-6 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent sticky bottom-0 z-20">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative flex items-center group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="w-full pl-6 pr-14 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 focus:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500 transition-all text-zinc-100 placeholder-zinc-500 shadow-lg backdrop-blur-md"
            disabled={isThinking}
          />
          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="absolute right-3 p-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
