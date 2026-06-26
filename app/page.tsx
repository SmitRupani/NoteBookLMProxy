"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "ai";
  content: string;
  trace?: {
    rewrittenQuery?: string;
    subqueries?: string[];
    evaluations?: {
      text: string;
      grade: "CORRECT" | "AMBIGUOUS" | "INCORRECT";
      reason: string;
    }[];
    fallbackTriggered?: boolean;
    fallbackType?: "NONE" | "SECONDARY_RETRIEVAL" | "GENERAL_KNOWLEDGE";
    secondaryQuery?: string;
  };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [fileName, setFileName] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setFileName(file.name);
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

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
        setFileName("");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to upload document.");
      setFileName("");
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
        setMessages((prev) => [
          ...prev,
          { role: "ai", content: data.reply, trace: data.trace },
        ]);
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

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleResetWorkspace = () => {
    setMessages([]);
    setIsIndexed(false);
    setFileName("");
  };

  if (!isIndexed) {
    return (
      <div className="page-shell min-h-screen flex items-center justify-center">
        <div className="ambient-orb ambient-orb-left" />
        <div className="ambient-orb ambient-orb-right" />

        <section className="upload-stage">
          <p className="eyebrow">Advanced RAG Workspace</p>
          <h1>Notebook Proxy</h1>
          <p className="subtitle">
            Upload your document to activate the advanced query-rewriting, sub-query decomposition, and Corrective RAG (CRAG) pipeline.
          </p>

          <div className="upload-panel">
            {isUploading ? (
              <div className="upload-loading" role="status" aria-live="polite">
                <span className="spinner" />
                <p>Analyzing & Indexing Document...</p>
                <small>Creating chunk embeddings and uploading to Pinecone namespace</small>
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
    <div className="dashboard-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo">N</div>
            <span className="sidebar-title">Notebook Proxy</span>
          </div>

          <div className="sidebar-section">
            <span className="trace-label">Active Document</span>
            <div className="doc-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <svg style={{ width: '1.2rem', height: '1.2rem', color: 'var(--brand-teal-light)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span className="doc-card-title">{fileName || "document.pdf"}</span>
              </div>
              <div className="doc-stat">
                <span style={{ width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: '#34d399' }} />
                <span>Indexed & Connected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar-section" style={{ gap: '0.6rem' }}>
          <button onClick={handleClearChat} className="action-btn">
            <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Conversation
          </button>
          <button onClick={handleResetWorkspace} className="action-btn danger">
            <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
            </svg>
            Disconnect Document
          </button>
        </div>
      </aside>

      {/* CHAT WORKSPACE */}
      <div className="chat-workspace">
        <header className="chat-header">
          <h2>Conversation Workspace</h2>
          <div className="doc-stat" style={{ fontSize: '0.8rem' }}>
            <span>Pipeline Status: Active (CRAG + Rewrite)</span>
          </div>
        </header>

        <main className="chat-main">
          <div className="chat-feed">
            {messages.length === 0 ? (
              <section className="empty-state" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-light)', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
                <h3 style={{ color: '#ffffff', margin: '0 0 0.5rem', fontSize: '1.2rem' }}>Workspace Activated</h3>
                <p style={{ color: 'var(--ink-secondary)', margin: 0 }}>
                  Ask questions grounded in the context of the uploaded PDF. The RAG pipeline will trace search transformations and evaluations below each response.
                </p>
              </section>
            ) : (
              <div className="message-list">
                {messages.map((msg, i) => (
                  <div key={i} className={`message-row ${msg.role === "user" ? "user" : "ai"}`}>
                    <div className="message-bubble">
                      <p>{msg.content}</p>
                      
                      {msg.trace && (
                        <details className="rag-trace">
                          <summary className="rag-trace-summary">
                            <span className="rag-trace-icon">
                              <svg style={{ width: '0.9rem', height: '0.9rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                              </svg>
                              RAG Pipeline Trace
                            </span>
                            <span>⚡ Click to Inspect</span>
                          </summary>
                          <div className="rag-trace-details">
                            {msg.trace.rewrittenQuery && (
                              <div className="trace-item">
                                <span className="trace-label">Query Rewriting</span>
                                <div className="trace-value">{msg.trace.rewrittenQuery}</div>
                              </div>
                            )}

                            {msg.trace.subqueries && msg.trace.subqueries.length > 0 && (
                              <div className="trace-item">
                                <span className="trace-label">Sub-Query Decomposition</span>
                                <div className="trace-subqueries-list">
                                  {msg.trace.subqueries.map((sq, idx) => (
                                    <span key={idx} className="trace-subquery-tag">{sq}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {msg.trace.fallbackTriggered && (
                              <div className="trace-fallback-banner">
                                <span>⚠️</span>
                                <div>
                                  <strong>Corrective Action (CRAG) Triggered:</strong> {msg.trace.fallbackType === "SECONDARY_RETRIEVAL" ? "Secondary Retrieval Attempt" : "General Knowledge Fallback"}
                                  {msg.trace.secondaryQuery && <div style={{ marginTop: '0.2rem', opacity: 0.85 }}>Secondary Search: "{msg.trace.secondaryQuery}"</div>}
                                </div>
                              </div>
                            )}

                            {msg.trace.evaluations && msg.trace.evaluations.length > 0 && (
                              <div className="trace-item">
                                <span className="trace-label">Document Relevance Evaluations</span>
                                <div className="trace-evals">
                                  {msg.trace.evaluations.map((ev, idx) => (
                                    <div key={idx} className="trace-chunk-card">
                                      <div className="trace-chunk-header">
                                        <span className="text-xs text-slate-400 font-mono">Chunk {idx + 1}</span>
                                        <span className={`trace-badge ${ev.grade.toLowerCase()}`}>{ev.grade}</span>
                                      </div>
                                      <div className="trace-chunk-text" title="Hover/Click to expand.">
                                        {ev.text}
                                      </div>
                                      <div className="trace-chunk-reason">
                                        Reason: {ev.reason}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
                
                {isThinking && (
                  <div className="message-row ai">
                    <div className="message-bubble thinking-bubble">
                      <span>Generating Answer</span>
                      <div className="dot-loader" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
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
              placeholder="Ask a question about the document..."
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
    </div>
  );
}
