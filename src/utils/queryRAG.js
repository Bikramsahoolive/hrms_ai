import ai from '../LLms/gemini.js';
import groqai from '../LLms/groq.js';
import { Pinecone } from '@pinecone-database/pinecone';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {encode} from "@toon-format/toon"
import logger from './logger.js';
import 'dotenv/config';

const transport = new StdioClientTransport({
  command: "node",
  args: ["./src/mcp/server.js"]
});

const client = new Client({ name: "my-app-client", version: "1.0.0" });
await client.connect(transport);

const { tools: mcpTools } = await client.listTools();

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

async function askEmployeeDatabase({queryPrompt,sid}) {
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

  const queryDocResponse = await index.namespace('documents').query({
    vector: queryVector,
    topK: 3,
    includeMetadata: true,
  });

  const matches = queryResponse.matches || [];
  
  if (matches.length === 0) {
      console.log('No matching records found in Pinecone.');
      return;
    }

    const matchesDoc = queryDocResponse.matches || [];
  
  if (matchesDoc.length === 0) {
      console.log('No matching Document found in Pinecone.');  
      return;
    }


      // console.log('\n--- Matching Results ---');


    const context = matches
    .map((match, idx) => `Record ${idx + 1}:\n${match.metadata.rawText}`)
    .join('\n\n');


    const contextDoc = matchesDoc
    .map((match, idx) => `Record ${idx + 1}:\n${match.metadata.rawText}`)
    .join('\n\n');




    const prompt = `You are a helpful HRMS assistant and your name is Prath AI. Answer the user's question with a human touch, you may use the retrieved employee records below. If the information is not in the context, you can answer your own or may say "I don't know". try to answer in short like below 50 to 100 words, also give data in list not in table format, if any one give coding or programming related question then just answer : "I am your HRMS Assistant not your coding Guru 😎", Don't give additional information if not asked,
requested_user_id: ${atob(sid)}
To day's date is: ${new Date().toLocaleDateString('en-GB', {timeZone: 'Asia/Kolkata'})}
CONTEXT DATA:
${context}
${contextDoc}

USER QUESTION:
${queryPrompt}

ANSWER:`;

  console.log('Generating AI Response...\n');



 
  try {
    const response = await geminiResponse(prompt);
    return response || 'No response from Prath AI.';
  }
  catch (error) {
    console.error('Error with Gemini AI:', error);
    console.log('Falling back to GPT...');

    try {
      const response = await groqResponse(prompt);
      return response || 'No response from Prath AI.';
    }
    catch (error) {
      console.error('Error with GPT:', error);
      return 'Prath AI failed to generate a response.';
    }
  } 
}



  async function geminiResponse(prompt) {

    const geminiFunctionDeclarations = mcpTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.inputSchema,
}));

    const result = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        temperature: 0.0, // Set temperature here (Range: 0.0 to 2.0)
        tools: [{ functionDeclarations: geminiFunctionDeclarations }],
      },
    });  

    const functionCall = result.functionCalls?.[0];
    const candidatePart = result.candidates[0].content.parts[0];

    if (!functionCall) {
    return result.text || candidatePart?.text || 'No response from Gemini AI.';
  }


  console.log(`Gemini requested tool execution: ${functionCall.name}`);


    const mcpResult = await client.callTool({
    name: functionCall.name,
    arguments: functionCall.args,
  });

  console.log(`Tool Output: ${mcpResult.content[0].text}`);
  const toolOutputText = encode(mcpResult.content[0].text);


  const finalResult = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: [candidatePart] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: functionCall.name,
              response: { result: toolOutputText },
            },
          },
        ],
      },
    ],
  });
    return finalResult.text;
  }

  async function groqResponse(prompt) {

    const groqTools = mcpTools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }
  }));

  const messages = [
    { role: 'system', content: 'You are a helpful HRMS assistant.' },
    { role: 'user', content: prompt }
  ];
    const result = await groqai.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful HRMS assistant.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.0, // Set temperature here (Range: 0.0 to 2.0)
      tools: groqTools
    });



const responseMessage = result.choices[0]?.message;

  if (!responseMessage?.tool_calls) {
    return responseMessage?.content || 'No response from Prath AI.';
  }

const toolCall = responseMessage.tool_calls[0];
  console.log(`GPT requested tool execution: ${toolCall.function.name}`);

  const args = JSON.parse(toolCall.function.arguments);
  const mcpResult = await client.callTool({
    name: toolCall.function.name,
    arguments: args,
  });

  console.log(`Tool Output: ${mcpResult.content[0].text}`);
  const toolOutputText = encode(mcpResult.content[0].text);


  messages.push(responseMessage);
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: toolOutputText,
  });

  const finalResponse = await groqai.chat.completions.create({
    model: 'openai/gpt-oss-20b',
    messages: messages,
    temperature: 0.0,
    tools: groqTools
  });

  return finalResponse.choices[0]?.message?.content;
  }

async function main(prompt) {
  try {
    const reqLogger = logger.child({ prompt:prompt });
   const answer = await askEmployeeDatabase( prompt);
    reqLogger.info({answer:answer});
   return answer;
  } catch (error) {
    console.error('Error in main function:', error);
   return 'Prath AI is facing some issue. Please try again later';
  }
}

export default main;