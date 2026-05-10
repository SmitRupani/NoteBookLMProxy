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

  if (!isIndexed) {
    return (
      <div className="page-shell">
        <div className="ambient-orb ambient-orb-left" />
        <div className="ambient-orb ambient-orb-right" />

        <section className="upload-stage">
          <p className="eyebrow">Document-grounded assistant</p>
          <h1>Notebook Proxy</h1>
          <p className="subtitle">
            Upload one PDF and ask focused questions. Responses stay tied to the indexed context.
          </p>

          <div className="upload-panel">
            {isUploading ? (
              <div className="upload-loading" role="status" aria-live="polite">
                <span className="spinner" />
                <p>Indexing your document...</p>
                <small>Building chunk embeddings and storing vectors</small>
              </div>
            ) : (
              <label className="upload-dropzone">
                <div className="drop-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M12 15V4m0 0-3.5 3.5M12 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 15.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 15.5" strokeLinecap="round" />
                  </svg>
                </div>
                <strong>Drop your PDF here</strong>
                <span>or click to browse files</span>
                <input type="file" accept="application/pdf" className="visually-hidden" onChange={handleFileUpload} />
              </label>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell chat-shell">
      <div className="ambient-orb ambient-orb-left" />
      <div className="ambient-orb ambient-orb-right" />

      <header className="chat-header">
        <div>
          <p className="eyebrow">Indexed document ready</p>
          <h2>Notebook Proxy Chat</h2>
        </div>
      </header>

      <main className="chat-main">
        <div className="chat-feed">
          {messages.length === 0 ? (
            <section className="empty-state">
              <h3>Ready for your first question</h3>
              <p>
                Ask about facts, timelines, decisions, or summaries from the uploaded PDF.
              </p>
            </section>
          ) : (
            <div className="message-list">
              {messages.map((msg, i) => (
                <div key={i} className={`message-row ${msg.role === "user" ? "user" : "ai"}`}>
                  <div className="message-bubble">
                    <p>{msg.content}</p>
                  </div>
                </div>
              ))}
              
              {isThinking && (
                <div className="message-row ai">
                  <div className="message-bubble thinking-bubble">
                    <span>Thinking</span>
                    <div className="dot-loader" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <div className="composer-wrap">
        <form onSubmit={handleSendMessage} className="composer">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="composer-input"
            disabled={isThinking}
          />
          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="composer-send"
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
