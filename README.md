# Notebook-RAG: Custom Document Chatbot

- Deployed link:- https://notebook-lm-nu.vercel.app/
- Github link:- https://github.com/LAKSHYAMEWARA0025/notebook-lm

## 1. Project Title & Overview

**Notebook-RAG** is a custom document chatbot inspired by NotebookLM. It allows users to upload PDF documents and instantly chat with their contents. The application uses advanced Retrieval-Augmented Generation (RAG) techniques to ensure that the AI understands the uploaded context and answers user queries accurately, without hallucination.

---

## 2. Assignment Problem Statement Addressed

This project fulfills the requirements of building a full-stack RAG application. The system solves the problem of querying long-form, unstructured data by allowing users to securely upload PDFs, intelligently extracting and storing the data, and offering a natural language interface. Users can ask questions, and the system intelligently grounds its answers strictly within the boundaries of the uploaded document.

---

## 3. Architecture & Tech Stack

Our custom architecture was carefully selected to ensure production-level stability and high-quality outputs:

- **Frontend/Backend:** Built using **Next.js (App Router)** for seamless serverless API routing and client-side rendering. Styled with **Tailwind CSS** using a custom Deep Black/Orange aesthetic.
- **PDF Extraction:** Utilizes **unpdf** (`getDocumentProxy` + `extractText`). This bypasses standard web worker module resolution errors typical in Next.js/Turbopack environments, providing robust server-side text parsing.
- **Embeddings:** Powered by **Google Generative AI Embeddings** (configured for 3072 dimensions) to capture deep semantic meaning.
- **Vector Database:** **Pinecone** acts as our vector store. We implemented manual Pinecone v5 SDK logic (`index.query()`) to bypass buggy LangChain wrapper conflicts and ensure stable upserts and top-K retrievals.
- **LLM:** **Google Gemini 2.5 Flash** (via `ChatGoogleGenerativeAI`) provides incredibly fast, highly accurate answer generation.

---

## 4. The RAG Pipeline

The core of Notebook-RAG is a robust pipeline that breaks down unstructured PDFs into queryable context.

1. **Ingestion:** The user uploads a PDF via the frontend UI. The file is sent as a `FormData` Blob to the backend `/api/ingest` route, where `unpdf` extracts the raw text.
2. **Chunking Strategy:** The raw text is passed through LangChain's `RecursiveCharacterTextSplitter`. 
   - **Chunk Size:** `1000`
   - **Chunk Overlap:** `100`
   - *Why?* This strategy ensures that context isn't lost across paragraph breaks. The 100-character overlap maintains the semantic bridge between adjacent chunks, preventing critical sentences from being awkwardly split.
3. **Embedding & Storage:** The chunks are converted into 3072-dimensional vector embeddings using Google Generative AI. These vectors, along with the raw chunk text stored securely as metadata, are manually upserted into our Pinecone index.
4. **Retrieval & Generation:** When a user asks a question, their query is embedded. The system queries Pinecone using cosine similarity to retrieve the top 4 most relevant chunks. These chunks are injected into the LLM prompt.

---

## 5. Answer Quality & Anti-Hallucination Measures

To guarantee that the AI acts as an assistant *for the document* rather than a general-purpose chatbot, answer quality is tightly controlled. 

The LLM is governed by a **strict system prompt**:
> *"You are a helpful assistant. Use ONLY the provided context to answer the user's question. If the answer is not in the context, say you do not know. Do not hallucinate."*

This measure guarantees that all responses are 100% grounded in the uploaded document, entirely eliminating hallucinations.

---

## 6. Local Setup Instructions

To run this project locally on your machine, follow these steps:

### Prerequisites
Make sure you have Node.js (v18+) installed.

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd notebook-rag
```

### 2. Install Dependencies
```bash
npm install --legacy-peer-deps
```
*(Note: the `--legacy-peer-deps` flag is required to bypass LangChain/Pinecone version conflicts).*

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory of the project and add your API keys:

```env
# Google Gemini API Key for Embeddings and Chat Generation
GOOGLE_API_KEY=your_google_api_key_here

# Pinecone Database Configuration
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX=notebook-index
```

### 4. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application. Upload a PDF, wait for the indexing to complete, and start chatting!
