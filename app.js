// import gptResponse from "./gpt.js";
import genResponse from "./gemini.js";

genResponse("How much water need for a male.")
.then((data)=>{
    console.log(data.text);
})
.catch((error)=>{
    console.log(error);
    
})
