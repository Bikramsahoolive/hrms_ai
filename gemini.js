import{GoogleGenAI} from '@google/genai'
import dotenv from 'dotenv';
dotenv.config({quiet:true});

const ai = new GoogleGenAI({
    apiKey:process.env.genAI_apikey
})


async function genResponse (data){
    let response = await ai.models.generateContent({
        model:"gemini-3.6-flash",
        contents:data
    })

    return response;
}

export default genResponse;