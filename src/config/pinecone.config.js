import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const INDEX_NAME = "gemini-knowledge-base";

await pc.createIndex({
  name: INDEX_NAME,
  dimension: 1024,
  metric: 'cosine',
  spec: {
    serverless: {
      cloud: 'aws',
      region: 'us-east-1',
    },
  },
});

// const index = pc.index({name:INDEX_NAME});
// console.log(index._fetchCommand.apiProvider.indexName);

