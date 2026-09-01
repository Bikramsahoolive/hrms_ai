import {OpenAI} from "openai";
import dotenv from 'dotenv';
dotenv.config({quiet:true});

const ai = new OpenAI({
    apiKey:process.env.openai_apikey
});

async function gptResponse (data){
    let response = await ai.responses.create({
        model:'gpt-5',
        input:data
    })

    return response;
}

export default gptResponse;