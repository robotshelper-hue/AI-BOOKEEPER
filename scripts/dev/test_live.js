import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  try {
    const session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{text: "Hello"}] },
      },
      callbacks: {
        onmessage: (msg) => console.log("msg:", msg)
      }
    });
    console.log("Connected!");
    session.close();
  } catch(e) {
    console.error("error 0:", e, "error 1:", e._errorEmitted);
  }
}
test();
