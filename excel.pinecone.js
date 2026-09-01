import XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.genAI_apikey });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const INDEX_NAME = 'gemini-knowledge-base';
const EMBEDDING_MODEL = 'gemini-embedding-001';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet);
}

async function getEmbedding(text, retries = 5, delay = 2000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [{ parts: [{ text }] }],
        config: {
    outputDimensionality: 1024,
  }
      });

      const vector = response?.embeddings?.[0]?.values;

      if (Array.isArray(vector) && vector.length > 0) {
        return vector;
      }

      console.error('[Empty Vector] Response:', JSON.stringify(response).slice(0, 400));
      return null;

    } catch (err) {
      const isQuotaError =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED');

      if (isQuotaError && attempt < retries - 1) {
        const wait = delay * Math.pow(2, attempt);
        console.warn(`[429] Waiting ${wait / 1000}s... (attempt ${attempt + 1}/${retries})`);
        await sleep(wait);
        continue;
      }

      console.error(`[Embedding Error] ${err?.message || err}`);
      return null;
    }
  }
  return null;
}

async function main() {
  const rows = readExcelFile('./data/excel/data.xlsx');
  console.log(`Found ${rows.length} rows.\n`);

  const records = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const empId      = String(row['Employee ID']   || `EMP_${i + 1}`);
    const empName    = String(row['Employee Name'] || 'Unknown');
    const dept       = String(row['Department']    || 'N/A');
    const employment = String(row['Employment']    || 'N/A');

    const text = [
      `Employee ID: ${empId}`,
      `Name: ${empName}`,
      `Department: ${dept}`,
      `Employment: ${employment}`,
      `Total Days: ${row['Total Days']        || 0}`,
      `Pay-Out Days: ${row['Pay-Out Days']    || 0}`,
      `Total Present: ${row['Total Present']  || 0}`,
      `Total WFO: ${row['Total WFO']          || 0}`,
      `Total WFH: ${row['Total WFH']          || 0}`,
      `Total LOP: ${row['Total LOP']          || 0}`,
      `Total Leaves: ${row['Total Leaves take'] || row['Total Leaves taken'] || 0}`,
      `Avg Working Hours: ${row['Avg Working Hr'] || 0}`,
    ].join('. ');

    console.log(`[${i + 1}/${rows.length}] ${empName} (${empId})`);

    const vector = await getEmbedding(text);

    if (vector) {
      records.push({
        id: empId,
        values: vector,
        metadata: {
          employeeId:   empId,
          employeeName: empName,
          department:   dept,
          employment,
          totalPresent: Number(row['Total Present']) || 0,
          totalLOP:     Number(row['Total LOP'])     || 0,
          totalWFO:     Number(row['Total WFO'])     || 0,
          totalWFH:     Number(row['Total WFH'])     || 0,
          totalLeaves:  Number(row['Total Leaves take'] || row['Total Leaves taken']) || 0,
          avgWorkingHr: Number(row['Avg Working Hr']) || 0,
          rawText:      text,
        },
      });
      console.log(`  ✅ OK — records so far: ${records.length}`);
    } else {
      console.warn(`  ❌ Skipped`);
    }

    await sleep(1500);
  }

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`Total records to upsert: ${records.length}`);

  if (records.length === 0) {
    console.error('Nothing to upsert. Exiting.');
    return;
  }

  const index = pc.index({ name: INDEX_NAME });
  const BATCH = 100;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    console.log(`\nUpserting batch ${Math.floor(i / BATCH) + 1} (${batch.length} records)...`);
    await index.namespace('employees').upsert({ records: batch });
    console.log(`  ✅ Batch done`);
  }

  console.log(`\n✅ Done — ${records.length} records indexed in Pinecone.`);
}

main().catch((err)=>console.error(err));