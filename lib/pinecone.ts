import { Pinecone } from "@pinecone-database/pinecone";

const initPinecone = () => {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY is not defined in environment variables");
  }

  return new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
};

// Use a global variable to preserve the client across hot reloads in development
let pineconeInstance: Pinecone | null = null;

export const getPineconeClient = (): Pinecone => {
  if (!pineconeInstance) {
    pineconeInstance = initPinecone();
  }
  return pineconeInstance;
};
