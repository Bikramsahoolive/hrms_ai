import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.genAI_apikey });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const INDEX_NAME = 'gemini-knowledge-base';
const EMBEDDING_MODEL = 'gemini-embedding-001';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getQueryEmbedding(text, retries = 5, delay = 2000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
        config: {
          outputDimensionality: 1024, // Matches Pinecone index dimension
        },
      });

      const vector = response?.embeddings?.[0]?.values;
      if (Array.isArray(vector) && vector.length > 0) {
        return vector;
      }
      return null;
    } catch (err) {
      const isQuotaError =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED');

      if (isQuotaError && attempt < retries - 1) {
        const wait = delay * Math.pow(2, attempt);
        console.warn(`[429 Quota Exceeded] Retrying in ${wait / 1000}s... (Attempt ${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }

      console.error(`[Embedding Error] ${err?.message || err}`);
      throw err;
    }
  }
  return null;
}

async function askEmployeeDatabase(queryPrompt) {
  console.log(`\nQuery: "${queryPrompt}"`);
  
  // 1. Generate Query Vector with Backoff
  const queryVector = await getQueryEmbedding(queryPrompt);

  if (!queryVector) {
    console.error('Failed to generate embedding vector.');
    return;
  }

  // 2. Search Pinecone
  const index = pc.index({name:INDEX_NAME});
  const queryResponse = await index.namespace('employees').query({
    vector: queryVector,
    topK: 3,
    includeMetadata: true,
  });

  const matches = queryResponse.matches || [];
  
  if (matches.length === 0) {
      console.log('No matching records found in Pinecone.');
      return;
    }


    //   console.log('\n--- Matching Results ---');
    
//   queryResponse.matches?.forEach((match, idx) => {
//     const meta = match.metadata;
//     console.log(`\n#${idx + 1} [Score: ${match.score.toFixed(4)}] ID: ${match.id}`);
//     console.log(`   Name: ${meta?.employeeName} (${meta?.employeeId})`);
//     console.log(`   Total Present: ${meta?.totalPresent}`);
//     console.log(`   Total LOP: ${meta?.totalLOP}`);
//     console.log(`   Raw Text: ${meta?.rawText}`);
//   });


    const context = matches
    .map((match, idx) => `Record ${idx + 1}:\n${match.metadata.rawText}`)
    .join('\n\n');


    const prompt = `You are a helpful HR data assistant. Answer the user's question, you may use the retrieved employee records below. If the information is not in the context, you can answer your own or may say "I don't know. try to answer in short like below 50 to 100 words"

CONTEXT DATA:
${context}

USER QUESTION:
${queryPrompt}

ANSWER:`;

  console.log('Generating AI Response...\n');

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      temperature: 0.0, // 👈 Set temperature here (Range: 0.0 to 2.0)
    },
  });

  console.log('🤖 AI Answer:');
  console.log(response.text);

}

async function main() {
  const prompt = "bikram's total working hours.";
  await askEmployeeDatabase(prompt);
}

main().catch(console.error);