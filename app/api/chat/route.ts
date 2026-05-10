export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  getOpenRouterApiKey,
  OPENROUTER_BASE_URL,
  OPENROUTER_EMBED_MODEL,
  OPENROUTER_CHAT_MODEL,
} from "@/lib/openrouter";
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

    // 1. Embedding
    const embeddings = new OpenAIEmbeddings({
      apiKey: openRouterApiKey,
      model: OPENROUTER_EMBED_MODEL,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
      },
    });
    const embeddedMessage = await embeddings.embedQuery(message);

    // 2. Manual Retrieval (Pinecone v5 syntax)
    const pinecone = getPineconeClient();
    const baseIndexName = process.env.PINECONE_INDEX || "genai-rag-db";
    const indexName = await ensurePineconeIndex(baseIndexName, embeddedMessage.length);
    const pineconeIndex = pinecone.Index(indexName);
    const namespace = "pdf-ingestion-namespace";

    const namespacedQuery = await pineconeIndex.namespace(namespace).query({
      vector: embeddedMessage,
      topK: 8,
      includeMetadata: true,
    });

    // If namespace lookup returns nothing usable, query the default namespace as fallback.
    const namespaceContextPreview = namespacedQuery.matches
      ?.map((match) => readTextFromMetadata(match.metadata))
      .filter(Boolean)
      .join("\n\n");

    const queryResponse = namespaceContextPreview
      ? namespacedQuery
      : await pineconeIndex.query({
          vector: embeddedMessage,
          topK: 8,
          includeMetadata: true,
        });

    // 3. Context Mapping
    const contextTexts = queryResponse.matches
      ?.map((match) => readTextFromMetadata(match.metadata))
      .filter(Boolean)
      .join("\n\n");

    const contextString = contextTexts || "No relevant context found in the document.";

    // 4. Generation
    const llm = new ChatOpenAI({
      apiKey: openRouterApiKey,
      model: OPENROUTER_CHAT_MODEL,
      temperature: 0,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
      },
    });

    const completion = await llm.invoke([
        {
          role: "system",
          content:
            "You are a helpful assistant. Use ONLY the provided context to answer the user's question. If the answer is not in the context, say you do not know. Do not hallucinate. If user asks questions beyond scope tell them the scope you are limited to. Always use all available context to answer as best you can.",
        },
        {
          role: "user",
          content: `Context:\n${contextString}\n\nQuestion:\n${message}\n\nAnswer:`,
        },
      ]);

    const reply =
      typeof completion.content === "string"
        ? completion.content
        : JSON.stringify(completion.content);

    return NextResponse.json({ 
      reply,
      context: queryResponse.matches // Optional: to show sources in UI
    }, { status: 200 });

  } catch (error: unknown) {
    console.error("Chat API failed:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Chat failed", details }, { status: 500 });
  }
}
