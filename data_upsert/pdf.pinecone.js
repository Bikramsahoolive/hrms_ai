import fs from 'node:fs';
import path from 'node:path';
import { pdfToText } from 'pdf-ts';
import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

// Initialize APIs
const ai = new GoogleGenAI({ apiKey: process.env.genAI_apikey });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const INDEX_NAME = 'gemini-knowledge-base';
const NAMESPACE = 'documents';
const EMBEDDING_MODEL = 'gemini-embedding-001';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Extract raw text from PDF
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const text = await pdfToText(dataBuffer);
    return { text: text || '' };
  } catch (error) {
    console.error(`Error reading PDF at ${filePath}:`, error.message);
    return { text: '' };
  }
}

// Helper: Chunk text by words with sliding-window overlap
function chunkText(text, chunkSize = 300, overlap = 50) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const chunks = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunkWords = words.slice(i, i + chunkSize);
    if (chunkWords.length > 0) {
      chunks.push(chunkWords.join(' '));
    }
  }

  return chunks;
}

// Helper: Get Gemini Embedding with Exponential Backoff for 429 Errors
async function getEmbedding(text, retries = 5, delay = 2000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
        config: {
          outputDimensionality: 1024,
        },
      });

      const vector = response?.embeddings?.[0]?.values;
      if (Array.isArray(vector) && vector.length > 0) return vector;
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
      return null;
    }
  }
  return null;
}

// Main processing logic
async function processAndIndexPDF(filePath) {
  const fileName = path.basename(filePath, '.pdf');
  console.log(`\n📄 Reading PDF: ${filePath}...`);

  const { text } = await extractTextFromPDF(filePath);

  if (!text || text.trim().length === 0) {
    console.error(`❌ Could not extract text from ${filePath}. File may be empty or image-based.`);
    return;
  }

  console.log(`Extracted text (${text.length} chars).`);

  // 1. Create Chunk Objects
  const rawChunks = chunkText(text, 300, 50);
  console.log(`Split text into ${rawChunks.length} chunks.\n`);

  const records = [];

  // 2. Generate Vector Embeddings safely
  for (let i = 0; i < rawChunks.length; i++) {
    const chunkContent = rawChunks[i];
    const chunkId = `PDF_${fileName}_chunk_${i + 1}`;

    console.log(`[${i + 1}/${rawChunks.length}] Embedding chunk ${chunkId}...`);
    const vector = await getEmbedding(chunkContent);

    if (Array.isArray(vector) && vector.length > 0) {
      records.push({
        id: chunkId,
        values: vector,
        metadata: {
          sourceType: 'pdf',
          fileName: filePath,
          chunkIndex: i + 1,
          totalChunks: rawChunks.length,
          rawText: chunkContent,
        },
      });
    } else {
      console.warn(`⚠️ Skipped chunk ${chunkId} due to empty/failed vector embedding.`);
    }

    await sleep(1000); // Gentle delay to respect API limits
  }

  if (records.length === 0) {
    console.error('❌ No valid vectors were generated. Skipping Pinecone upsert.');
    return;
  }

  // 3. Upsert to Pinecone
  console.log(`\nUpserting ${records.length} records into Pinecone namespace: "${NAMESPACE}"...`);
  const index = pc.index({name:INDEX_NAME});

  const BATCH = 100;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH).filter(Boolean);
    if (batch.length > 0) {
      await index.namespace(NAMESPACE).upsert({ records: batch });
    }
  }

  console.log(`✅ Success! Indexed ${records.length} PDF chunks into namespace "${NAMESPACE}".`);
}

async function main() {
  const pdfPath = './data/pdf/HR_Policy.pdf';
  await processAndIndexPDF(pdfPath);
}

main().catch(console.error);