export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import {
  getOpenRouterApiKey,
  OPENROUTER_BASE_URL,
  OPENROUTER_EMBED_DIMENSION,
  OPENROUTER_EMBED_MODEL,
} from "@/lib/openrouter";
import { ensurePineconeIndex, getPineconeClient } from "@/lib/pinecone";
import { extractText, getDocumentProxy } from "unpdf";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No valid PDF file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. PDF EXTRACTION
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: fullText } = await extractText(pdf, { mergePages: true });

    console.log("Raw text length:", fullText.length);
    console.log("Raw text sample:", fullText.slice(0, 300));

    // SANITIZATION
    const sanitizedText = fullText
      .replace(/\0/g, "")
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, "");

    // 2. CHUNKING
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 100,
    });
    const chunks = await textSplitter.splitText(sanitizedText);
    const cleanChunks = chunks.filter((c) => c.trim().length > 5);

    console.log("Chunks before filter:", chunks.length);
    console.log("Chunks after filter:", cleanChunks.length);

    // 3. OPENROUTER EMBEDDINGS (OpenAI SDK compatible)
    const openRouterApiKey = getOpenRouterApiKey();
    const embeddings = new OpenAIEmbeddings({
      apiKey: openRouterApiKey,
      model: OPENROUTER_EMBED_MODEL,
      configuration: {
        baseURL: OPENROUTER_BASE_URL,
      },
    });

    // 4. PINECONE UPSERT
    const pinecone = getPineconeClient();
    const baseIndexName = process.env.PINECONE_INDEX || "notebook-index-openrouter";
    const indexName = await ensurePineconeIndex(
      baseIndexName,
      OPENROUTER_EMBED_DIMENSION
    );
    const namespace = "pdf-ingestion-namespace";

    const pineconeIndex = pinecone.Index(indexName);

    // Clear old namespace data
    try {
      await pineconeIndex.namespace(namespace).deleteAll();
      await new Promise((r) => setTimeout(r, 1000));
      console.log("Namespace cleared.");
    } catch {
      console.log("Namespace clear skipped (likely empty).");
    }

    console.log("Generating embeddings and upserting...");

    const chunkEmbeddings = await embeddings.embedDocuments(cleanChunks);

    const vectors = cleanChunks.map((text, i) => {
      const values = chunkEmbeddings[i];
      if (!values) {
        throw new Error(`Embedding generation failed for chunk ${i}`);
      }

      return {
        id: `vec-${Date.now()}-${i}`,
        values,
        metadata: {
          text,
          pageContent: text,
          content: text,
          chunk: text,
          chunkIndex: i,
        },
      };
    });

    console.log("Vectors generated:", vectors.length);
    console.log("Sample vector length:", vectors[0]?.values?.length);

    await pineconeIndex.namespace(namespace).upsert(vectors);

    return NextResponse.json(
      { message: "Success", chunksProcessed: cleanChunks.length },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Ingestion failed:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Ingestion failed", details },
      { status: 500 }
    );
  }
}