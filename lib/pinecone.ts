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

export const ensurePineconeIndex = async (
  baseIndexName: string,
  dimension: number
): Promise<string> => {
  const pinecone = getPineconeClient();
  const existingIndexes = await pinecone.listIndexes();
  const indexNames = existingIndexes.indexes?.map((idx) => idx.name) ?? [];

  if (!indexNames.includes(baseIndexName)) {
    await pinecone.createIndex({
      name: baseIndexName,
      dimension,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1",
        },
      },
      waitUntilReady: true,
    });
    return baseIndexName;
  }

  const indexInfo = await pinecone.describeIndex(baseIndexName);
  if (indexInfo.dimension === dimension) {
    return baseIndexName;
  }

  const compatibleIndexName = `${baseIndexName}-${dimension}`;
  if (!indexNames.includes(compatibleIndexName)) {
    await pinecone.createIndex({
      name: compatibleIndexName,
      dimension,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1",
        },
      },
      waitUntilReady: true,
    });
  }

  return compatibleIndexName;
};
