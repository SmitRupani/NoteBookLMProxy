import { ChatOpenAI } from "@langchain/openai";
import { OPENROUTER_CHAT_MODEL, OPENROUTER_BASE_URL } from "./openrouter";

type CacheEntry = {
  rewritten: string;
  subqueries: string[];
  ts: number;
 };

// Simple in-memory cache with TTL to avoid repeated rewrites
const cache = new Map<string, CacheEntry>();
const TTL_MS = 1000 * 60 * 10; // 10 minutes

const readCache = (key: string) => {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e;
};

export async function rewriteAndExpand(
  message: string,
  openRouterApiKey: string,
  maxSubqueries = 3
): Promise<{ rewritten: string; subqueries: string[] }> {
  const key = `rw:${message}`;
  const cached = readCache(key);
  if (cached) return { rewritten: cached.rewritten, subqueries: cached.subqueries };

  const llm = new ChatOpenAI({
    apiKey: openRouterApiKey,
    model: OPENROUTER_CHAT_MODEL,
    temperature: 0,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });

  const prompt = `You are a lightweight query-rewriter used to improve vector DB retrieval.
Given a user's question, do the following and RETURN JSON ONLY with keys: rewritten and subqueries.
- "rewritten": a concise, search-friendly English rewrite of the query (1 sentence).
- "subqueries": an array of up to ${maxSubqueries} short query phrases useful for retrieval (no more than 6 words each).
If the input is not English, translate to English first then produce the rewrite.
Input: ${message}`;

  try {
    const resp = await llm.invoke([
      { role: "system", content: "You rewrite queries for vector search. Be concise. Output strict JSON only." },
      { role: "user", content: prompt },
    ]);

    const raw = typeof resp.content === "string" ? resp.content : JSON.stringify(resp.content);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let parsed: any = null;
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // fallthrough
      }
    }

    if (!parsed) {
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const rewritten = lines[0] ?? message;
      const subqueries = lines.slice(1, 1 + maxSubqueries).map((s) => s.replace(/^[-\d\.\)\s]+/, ""));
      const entry = { rewritten, subqueries, ts: Date.now() };
      cache.set(key, entry);
      return { rewritten, subqueries };
    }

    const rewritten = (parsed.rewritten && String(parsed.rewritten).trim()) || message;
    const subqueries = Array.isArray(parsed.subqueries)
      ? parsed.subqueries.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, maxSubqueries)
      : [];

    const entry: CacheEntry = { rewritten, subqueries, ts: Date.now() };
    cache.set(key, entry);

    return { rewritten, subqueries };
  } catch (err) {
    return { rewritten: message, subqueries: [] };
  }
}

export interface ChunkEvaluation {
  text: string;
  grade: "CORRECT" | "AMBIGUOUS" | "INCORRECT";
  reason: string;
}

export async function evaluateChunks(
  query: string,
  chunks: string[],
  openRouterApiKey: string
): Promise<ChunkEvaluation[]> {
  if (!chunks || chunks.length === 0) return [];

  const llm = new ChatOpenAI({
    apiKey: openRouterApiKey,
    model: OPENROUTER_CHAT_MODEL,
    temperature: 0,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });

  const chunksInput = chunks.map((c, i) => `Chunk ${i}:\n${c}`).join("\n\n---\n\n");
  const prompt = `You are a strict relevance evaluator for a RAG (Retrieval-Augmented Generation) system.
Your job is to evaluate if the provided text chunks contain relevant information to answer the user query.
For each chunk, grade its relevance as:
- "CORRECT": The chunk contains direct, useful, or highly relevant information that helps answer the query.
- "AMBIGUOUS": The chunk is somewhat related, mentions key terms, but doesn't fully answer or contain clear info.
- "INCORRECT": The chunk is completely irrelevant to the query.

User Query: "${query}"

Here are the retrieved Chunks to evaluate:
${chunksInput}

Respond with a JSON array ONLY. Do not write markdown tags (unless they are inside the json block) or preambles.
Format:
[
  {
    "index": 0,
    "grade": "CORRECT",
    "reason": "Brief one sentence explanation of why this grade was assigned."
  },
  ...
]`;

  try {
    const resp = await llm.invoke([
      { role: "system", content: "You evaluate document chunk relevance. Respond only with a strict JSON array of objects." },
      { role: "user", content: prompt },
    ]);

    const raw = typeof resp.content === "string" ? resp.content : JSON.stringify(resp.content);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    let parsed: any[] = [];
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // fallthrough
      }
    }

    return chunks.map((text, i) => {
      const match = Array.isArray(parsed) ? parsed.find((item) => item.index === i) : null;
      return {
        text,
        grade: match && ["CORRECT", "AMBIGUOUS", "INCORRECT"].includes(match.grade)
          ? match.grade
          : "AMBIGUOUS",
        reason: match && match.reason ? String(match.reason) : "Evaluation completed with fallback default.",
      };
    });
  } catch (err) {
    console.error("Chunk evaluation failed:", err);
    return chunks.map((text) => ({
      text,
      grade: "AMBIGUOUS",
      reason: "Failed to perform automated LLM relevance evaluation.",
    }));
  }
}

export function clearRewriteCache() {
  cache.clear();
}
