import{GoogleGenAI} from '@google/genai'
import dotenv from 'dotenv';
dotenv.config({quiet:true});

const ai = new GoogleGenAI({
    apiKey:process.env.genAI_apikey
})


export default ai;