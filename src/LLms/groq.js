import Groq from 'groq-sdk';
import 'dotenv/config';

// Initialize the client
// By default, it automatically picks up process.env.GROQ_API_KEY
const groqai = new Groq({
  apiKey: process.env.groq_apikey, 
  // maxRetries: 2, // Optional: defaults to 2
  // timeout: 20000, // Optional: defaults to 60000 (1 min)
});

export default groqai;