# NotebookLM Proxy

- Deployed link: https://note-book-lm-proxy.vercel.app/
- GitHub link: https://github.com/SmitRupani/NoteBookLMProxy

NotebookLM Proxy is a single-document RAG app that lets you upload a PDF, index it in Pinecone, and ask questions grounded only in the uploaded content.

## Tech Stack

- Next.js App Router
- OpenRouter with the OpenAI SDK-compatible LangChain wrappers
- Pinecone vector database
- unpdf for PDF text extraction
- Tailwind CSS for styling

## How It Works

1. Upload a PDF in the UI.
2. The server extracts text with `unpdf` and splits it into overlapping chunks.
3. Each chunk is embedded using OpenRouter embeddings.
4. The chunks are stored in Pinecone with their raw text in metadata.
5. When you ask a question, the app embeds the query, retrieves the most relevant chunks from Pinecone, and sends that context to the chat model.

## Important Pinecone Notes

The embedding model used in the current app is `openai/text-embedding-3-small` through OpenRouter, which produces 1536-dimensional vectors.

That means:

- Your Pinecone index must use dimension `1536`.
- The same index name must be used for both ingestion and chat.
- The same namespace must be used in both routes.
- If you previously created a Pinecone index for a different embedding model, create a fresh index and re-upload the PDF.

Current code uses:

- Index name: `PINECONE_INDEX` from `.env.local`
- Default namespace: `pdf-ingestion-namespace`

## Environment Variables

Create a `.env.local` file in the project root:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_EMBED_MODEL=openai/text-embedding-3-small
OPENROUTER_CHAT_MODEL=openai/gpt-4o-mini
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX=your_pinecone_index_name
```

## Pinecone Setup

Create a serverless Pinecone index with these settings:

- Metric: `cosine`
- Dimension: `1536`
- Cloud: `AWS`
- Region: `us-east-1`

Use the same index name in `.env.local` for both ingestion and chat. If you change the embedding model or the index dimension, delete the old vectors, create a fresh index, and re-upload the PDF so the stored chunks match the new embedding space.

## Local Setup

```bash
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and upload a PDF to start chatting.

## Troubleshooting

If the app keeps answering “I don’t know” even though vectors exist in Pinecone:

- Verify the query is using the same index as ingestion.
- Verify the Pinecone index dimension is `1536`.
- Re-upload the PDF after changing the embedding model or index.
- Confirm the metadata contains the chunk text.
- Make sure the API key and index name in `.env.local` are correct.
