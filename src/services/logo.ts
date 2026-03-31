import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateLogo = async (): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            text: "A minimalist, modern vector logo for a cybersecurity AI called 'PhishGuard AI'. The logo should feature a stylized shield integrated with a digital circuit hook. Use a color palette of sky blue, deep ocean blue, and white. High-tech, professional, clean lines, isolated on a transparent or white background.",
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.warn("Logo generation failed (likely quota limit). Returning null for UI fallback.");
    return null;
  }
};
