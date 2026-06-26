export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  getOpenRouterApiKey,
  OPENROUTER_BASE_URL,
  OPENROUTER_EMBED_MODEL,
  OPENROUTER_CHAT_MODEL,
  OPENROUTER_EMBED_DIMENSION,
} from "@/lib/openrouter";
import { rewriteAndExpand, evaluateChunks } from "@/lib/queryRewriter";
import {
  ensurePineconeIndex,
  getPineconeClient,
} from "@/lib/pinecone";

const readTextFromMetadata = (metadata: Record<string, unknown> | undefined) => {
  if (!metadata) return "";

  const candidates = [
    metadata.text,
    metadata.pageContent,
    metadata.content,
    metadata.chunk,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
};

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const openRouterApiKey = getOpenRouterApiKey();

    // 1. Query rewrite + subquery expansion
    const { rewritten, subqueries } = await rewriteAndExpand(message, openRouterApiKey, 3);

    // 2. Embedding client
    const embeddings = new OpenAIEmbeddings({
      apiKey: openRouterApiKey,
      model: OPENROUTER_EMBED_MODEL,
      configuration: { baseURL: OPENROUTER_BASE_URL },
    });

    // 3. Pinecone setup
    const pinecone = getPineconeClient();
    const baseIndexName = process.env.PINECONE_INDEX || "genai-rag-db";
    const indexName = await ensurePineconeIndex(baseIndexName, OPENROUTER_EMBED_DIMENSION || 1536);
    const pineconeIndex = pinecone.Index(indexName);
    const namespace = "pdf-ingestion-namespace";

    // Helper function to query Pinecone for a set of queries
    const retrieveForQueries = async (queriesList: string[]) => {
      let matchesList: Array<any> = [];
      if (Array.isArray(queriesList) && queriesList.length > 0) {
        try {
          const subEmbeds = await embeddings.embedDocuments(queriesList);
          const queries = subEmbeds.map((vec) =>
            pineconeIndex.namespace(namespace).query({ vector: vec, topK: 6, includeMetadata: true })
          );
          const results = await Promise.all(queries);
          for (const r of results) {
            if (r.matches && r.matches.length) matchesList.push(...r.matches);
          }
        } catch (err) {
          console.warn("Parallel retrieval failed", err);
        }
      }
      return matchesList;
    };

    // 4. Run retrievals for subqueries
    let matches = await retrieveForQueries(subqueries);

    // 5. Fallback to single rewritten query if no subquery results
    if (matches.length === 0) {
      const primary = rewritten || message;
      try {
        const embeddedMessage = await embeddings.embedQuery(primary);
        const namespacedQuery = await pineconeIndex.namespace(namespace).query({
          vector: embeddedMessage,
          topK: 8,
          includeMetadata: true,
        });
        matches = namespacedQuery.matches || [];
      } catch (err) {
        console.warn("Primary retrieval failed", err);
      }
    }

    // Deduplicate and select top 8 matches
    const getUniqueMatches = (rawMatches: any[]) => {
      const unique = new Map<string, any>();
      for (const m of rawMatches) {
        const text = readTextFromMetadata(m.metadata) || m.id || JSON.stringify(m.metadata || {});
        const existing = unique.get(text);
        if (!existing) unique.set(text, m);
        else if ((m.score ?? 0) > (existing.score ?? 0)) unique.set(text, m);
      }
      return Array.from(unique.values())
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 8);
    };

    let dedupedMatches = getUniqueMatches(matches);
    let contextTexts = dedupedMatches.map((m) => readTextFromMetadata(m.metadata)).filter(Boolean);

    // 6. CORRECTIVE RAG: Evaluate chunks
    let evaluations = await evaluateChunks(message, contextTexts, openRouterApiKey);
    let correctChunks = evaluations.filter((e) => e.grade === "CORRECT");

    let fallbackTriggered = false;
    let fallbackType: "NONE" | "SECONDARY_RETRIEVAL" | "GENERAL_KNOWLEDGE" = "NONE";
    let secondaryQuery = "";

    // If no CORRECT chunks found, attempt a query rewrite for secondary retrieval
    if (correctChunks.length === 0) {
      fallbackTriggered = true;
      fallbackType = "SECONDARY_RETRIEVAL";
      
      // Let's generate a broader query
      secondaryQuery = `Broad concept: ${rewritten || message}`;
      console.log(`Triggering secondary retrieval with query: ${secondaryQuery}`);

      try {
        const embeddedMessage = await embeddings.embedQuery(secondaryQuery);
        const secQuery = await pineconeIndex.namespace(namespace).query({
          vector: embeddedMessage,
          topK: 6,
          includeMetadata: true,
        });
        
        const secondaryMatches = secQuery.matches || [];
        if (secondaryMatches.length > 0) {
          const newDeduped = getUniqueMatches(secondaryMatches);
          const newContextTexts = newDeduped.map((m) => readTextFromMetadata(m.metadata)).filter(Boolean);
          const newEvaluations = await evaluateChunks(message, newContextTexts, openRouterApiKey);
          
          // Merge or overwrite evaluations
          evaluations = newEvaluations;
          contextTexts = newContextTexts;
          dedupedMatches = newDeduped;
          correctChunks = evaluations.filter((e) => e.grade === "CORRECT");
        }
      } catch (err) {
        console.warn("Secondary retrieval execution failed:", err);
      }

      // If we still have no CORRECT chunks, trigger General Knowledge fallback
      if (correctChunks.length === 0) {
        fallbackType = "GENERAL_KNOWLEDGE";
      }
    }

    const contextString = contextTexts.join("\n\n");

    // 7. Generation
    const llm = new ChatOpenAI({
      apiKey: openRouterApiKey,
      model: OPENROUTER_CHAT_MODEL,
      temperature: 0,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
      },
    });

    let systemPrompt = "You are a helpful assistant. Use ONLY the provided context to answer the user's question. If the answer is not in the context, say you do not know. Do not hallucinate. If user asks questions beyond scope tell them the scope you are limited to. Always use all available context to answer as best you can.";
    let userPrompt = `Context:\n${contextString || "No relevant context found in the document."}\n\nQuestion:\n${message}\n\nAnswer:`;

    if (fallbackType === "GENERAL_KNOWLEDGE") {
      systemPrompt = "You are a helpful assistant. Note: No relevant information was found in the user's document for this query. Inform the user clearly that you couldn't find the answer in their uploaded document, and then answer the query using your general training knowledge to be as helpful as possible.";
      userPrompt = `Question:\n${message}\n\nAnswer (utilizing general knowledge since context was insufficient):`;
    }

    const completion = await llm.invoke([
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ]);

    const reply =
      typeof completion.content === "string"
        ? completion.content
        : JSON.stringify(completion.content);

    return NextResponse.json({ 
      reply,
      context: dedupedMatches,
      trace: {
        rewrittenQuery: rewritten,
        subqueries: subqueries,
        evaluations: evaluations,
        fallbackTriggered,
        fallbackType,
        secondaryQuery,
      }
    }, { status: 200 });

  } catch (error: unknown) {
    console.error("Chat API failed:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Chat failed", details }, { status: 500 });
  }
}
