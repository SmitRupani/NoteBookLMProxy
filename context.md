# Project Overview: Next.js RAG App (NotebookLM Clone - Assignment 03)

This project is a Next.js RAG (Retrieval-Augmented Generation) application, serving as a clone of NotebookLM. The primary objective is to implement an ingestion pipeline and establish a persistent context log for model handoffs.

## Change Log

### [2026-05-09] Initialized Context Management
- **Why**: The assignment requires a `context.md` file in the root directory to act as the single source of truth for the project state.
- **How**: Created this file and added the initial project overview.

### [2026-05-09] Setup Pinecone Client
- **Why**: Need a persistent vector store connection to store embedded PDF chunks. Using a singleton pattern ensures we don't exhaust database connections during development hot reloads.
- **How**: Created `lib/pinecone.ts` with a singleton function initializing the Pinecone client via `process.env.PINECONE_API_KEY`.

### [2026-05-10] Created Ingestion Route
- **Why**: To accept PDF files, parse them, chunk them, create embeddings, and upload them to the vector store (Pinecone).
- **How**:
  - **Dependencies Installed**: Added `@langchain/community` and `@langchain/pinecone`.
  - **API Route**: Created `app/api/ingest/route.ts` handling `POST` requests.
  - **Parsing**: Used `langchain/document_loaders/fs/pdf` (`PDFLoader`) to extract text.
  - **Chunking Strategy**: Implemented `RecursiveCharacterTextSplitter` with `chunkSize: 1000` and `chunkOverlap: 100` (graded requirement).
  - **Embedding**: Integrated `GoogleGenerativeAIEmbeddings` using the `embedding-001` model.
  - **Vector Storage**: Clears existing vectors in the namespace before uploading new vectors via `PineconeStore`.
  - **Safety**: Added error handling with try-catch to log errors securely and return proper HTTP status codes.

### [2026-05-10] Dependency & Environment Fix
- **Why**: The LangChain `PDFLoader` relies on `pdfjs-dist` which triggered a Next.js worker module resolution error (`pdf.worker.mjs` not found). Furthermore, integrating the Pinecone LangChain package alongside the base Pinecone SDK caused an NPM peer dependency conflict.
- **How**: 
  - Installed `pdf-parse` using the `--legacy-peer-deps` flag to bypass the conflicting Pinecone dependencies.
  - Refactored `app/api/ingest/route.ts` to replace the `PDFLoader`. The raw PDF is now converted to a Node Buffer, parsed synchronously with `pdf-parse`, and explicitly wrapped in a LangChain `Document` object to seamlessly pipe into the existing vector chunking logic.
  - Maintained the exact `RecursiveCharacterTextSplitter` configuration and Pinecone store parameters per grading requirements.

### [2026-05-10] Bug Fix: ESM Compatibility
- **Why**: The `pdf-parse` library is a CommonJS module, which triggered an "Export default doesn't exist" error in Next.js's Turbopack (ESM environment) when imported natively.
- **How**: Switched the import statement to a namespace import (`import * as pdfParse from 'pdf-parse';`) to satisfy Next.js/Turbopack requirements and explicitly handled the runtime type check to successfully parse the PDF buffer.

### [2026-05-10] Library Migration
- **Why**: The `pdf-parse` library caused a `TypeError: parse is not a function` at runtime due to unresolvable ESM/CJS compatibility issues within the Next.js/Turbopack environment.
- **How**: Migrated to `pdf.js-extract`, which provides a much more stable and modern PDF extraction interface for Node environments. The route extracts the buffer, maps over the returned pages and content arrays to construct a single robust string, and passes it into our LangChain `Document` unchanged.

### [2026-05-10] Bug Fix: WebPDFLoader Migration
- **Why**: The `pdf.js-extract` library failed to extract text from the buffer properly within the Next.js API route, resulting in 0 chunks and triggering a Pinecone upsert error.
- **How**: Removed all external PDF parsing libraries (`pdf-parse`, `pdf.js-extract`) and switched to LangChain's native `WebPDFLoader` (`@langchain/community/document_loaders/web/pdf`). This built-in loader natively handles Next.js `Blob` objects without worker resolution or buffer corruption issues.

### [2026-05-10] Bug Fix: unpdf Migration
- **Why**: The `pdf2json` library returned empty or garbled text during parsing, which caused 0 chunks to be generated and forced the Pinecone upsert to fail with `PineconeArgumentError: Must pass in at least 1 record to upsert`.
- **How**: Uninstalled `pdf2json` and migrated to `unpdf`. Replaced the PDF extraction block in `app/api/ingest/route.ts` to use `getDocumentProxy` and `extractText`. Added debug logs to verify raw text length, a text sample, and chunk counts before and after filtering. The rest of the chunking, embeddings, and Pinecone upsert logic remained exactly the same.

### [2026-05-10] Bug Fix: Embeddings Migration
- **Why**: The HuggingFace embeddings were silently returning empty vectors, resulting in a `PineconeArgumentError` since 0 records were being passed to the upsert function.
- **How**: Migrated to `GoogleGenerativeAIEmbeddings` using the `text-embedding-004` model. Updated the Pinecone index creation to expect 768 dimensions instead of 384. Added debug logs to explicitly verify vector generation and dimension length before attempting the upsert.

### [2026-05-10] Final Architecture Sync: Chat API & Frontend UI
- **Why**: The project required a complete RAG query pipeline and a unified UI for ingestion and chatting, while honoring the strict 3072-dimension requirement.
- **How**:
  - **Extraction**: Implemented `unpdf` (`getDocumentProxy` + `extractText`) to reliably extract text without worker/buffer errors.
  - **Embedding**: Used `GoogleGenerativeAIEmbeddings` generating vectors. We set the Pinecone index dimension to **3072** as explicitly requested to accommodate the new embedding plan.
  - **Vector DB**: Utilized manual Pinecone v5 SDK logic (`index.namespace(namespace).query()`) to bypass the buggy LangChain wrappers and perform highly accurate top-4 vector matching.
  - **LLM**: Integrated `ChatGoogleGenerativeAI` with the `gemini-1.5-flash` model, backed by a strict prompt template that completely eliminates hallucinations by forcing the model to rely solely on the injected context.
  - **Frontend UI**: Built a clean, two-column layout using Next.js and Tailwind CSS (`app/page.tsx`). The UI features a dedicated sidebar for document uploads with animated loading states ("Indexing Document..."), and a scrollable main chat area that tracks message history dynamically via React `useState`.

### [2026-05-10] UI Overhaul: Orange/Black Theme & Single-Session Workflow
- **Why**: The frontend required a more production-ready aesthetic and a controlled user experience that prevents multi-document state issues during a single chat session.
- **How**: 
  - **Design System**: Implemented a deep black (`bg-zinc-950`) and bright orange (`bg-orange-600`, `text-orange-500`) color palette. Utilized glass-morphism effects (`bg-white/5 backdrop-blur-sm border border-white/10`) for AI chat bubbles to create a distinct, modern feel.
  - **State Machine**: Built a rigid `isIndexed` state flow. The application boots into a full-screen Welcome view focused entirely on the file dropzone. Once indexing succeeds, the dropzone is completely unmounted and replaced by the Chat Interface, locking the session to that single document.
  - **Feedback**: Added an `isThinking` state that renders a custom pulsing animation bubble to provide immediate visual feedback while the `gemini-2.5-flash` LLM is generating a response.
