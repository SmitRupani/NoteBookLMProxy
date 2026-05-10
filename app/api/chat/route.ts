export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getPineconeClient } from "@/lib/pinecone";
import { PromptTemplate } from "@langchain/core/prompts";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // 1. Embedding
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "models/gemini-embedding-001", // Outputs 768 dimensions usually, but matching ingestion config
    });
    
    const embeddedMessage = await embeddings.embedQuery(message);

    // 2. Manual Retrieval (Pinecone v5 syntax)
    const pinecone = getPineconeClient();
    const indexName = process.env.PINECONE_INDEX || "notebook-index";
    const pineconeIndex = pinecone.Index(indexName);
    const namespace = "pdf-ingestion-namespace";

    const queryResponse = await pineconeIndex.namespace(namespace).query({
      vector: embeddedMessage,
      topK: 4,
      includeMetadata: true,
    });

    // 3. Context Mapping
    const contextTexts = queryResponse.matches
      ?.map((match) => match.metadata?.text)
      .filter((text) => text)
      .join("\n\n");

    const contextString = contextTexts || "No relevant context found in the document.";

    // 4. Generation
    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
      model: "gemini-2.5-flash",
      temperature: 0,
    });

    const prompt = PromptTemplate.fromTemplate(`You are a helpful assistant. Use ONLY the provided context to answer the user's question. If the answer is not in the context, say you do not know. Do not hallucinate.

Context:
{context}

Question:
{question}

Answer:`);

    const chain = prompt.pipe(llm);
    
    const response = await chain.invoke({
      context: contextString,
      question: message,
    });

    return NextResponse.json({ 
      reply: response.content,
      context: queryResponse.matches // Optional: to show sources in UI
    }, { status: 200 });

  } catch (error: any) {
    console.error("Chat API failed:", error);
    return NextResponse.json({ error: "Chat failed", details: error.message }, { status: 500 });
  }
}
