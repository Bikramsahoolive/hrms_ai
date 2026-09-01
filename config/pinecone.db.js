import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});


// await pc.createIndex({
//   name: INDEX_NAME,
//   dimension: 3072, // Matches Gemini's embedding output length
//   metric: 'cosine',
//   spec: {
//     serverless: {
//       cloud: 'aws',
//       region: 'us-east-1',
//     },
//   },
// });

export default pc;