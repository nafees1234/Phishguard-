import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  score: number; // 0 to 100
  verdict: "Safe" | "Suspicious" | "Malicious";
  reasoning: string[];
  features: {
    urgency: "High" | "Medium" | "Low";
    intent: string;
    socialEngineering: boolean;
    logoSpoofing?: boolean;
    detectedBrand?: string;
  };
}

export const analyzeContent = async (text: string, imageData?: string): Promise<AnalysisResult> => {
  const parts: any[] = [{ text: `Analyze the following for phishing or scam indicators. 
    ${text ? `Content: "${text}"` : "Analyze the provided image."}` }];

  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: imageData.split(',')[1] // Assuming base64
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER, description: "Phishing risk score from 0 to 100" },
          verdict: { type: Type.STRING, enum: ["Safe", "Suspicious", "Malicious"] },
          reasoning: { type: Type.ARRAY, items: { type: Type.STRING } },
          features: {
            type: Type.OBJECT,
            properties: {
              urgency: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
              intent: { type: Type.STRING },
              socialEngineering: { type: Type.BOOLEAN },
              logoSpoofing: { type: Type.BOOLEAN },
              detectedBrand: { type: Type.STRING }
            },
            required: ["urgency", "intent", "socialEngineering"]
          }
        },
        required: ["score", "verdict", "reasoning", "features"]
      },
      systemInstruction: "You are an expert cybersecurity analyst. Perform OCR on any images to extract text. Detect brand logos. If a known brand logo (e.g., PayPal, Bank of America, Amazon) is present but the context or domain is suspicious, mark it as logo spoofing and significantly increase the risk score. Look for social engineering triggers."
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Analysis failed");
  }
};

export const extractUrlFeatures = (url: string) => {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = urlObj.hostname;
    
    const features = {
      length: url.length,
      dots: url.split('.').length - 1,
      hasAt: url.includes('@'),
      hasHyphen: hostname.includes('-'),
      isIp: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname),
      subdomains: hostname.split('.').length - 2,
      isShortened: /bit\.ly|t\.co|goo\.gl|tinyurl\.com/.test(hostname),
      // Enhanced features
      excessiveSubdomains: (hostname.split('.').length - 2) > 3,
      hasSpecialChars: /[@_~%]/.test(hostname),
      isPunycode: hostname.includes('xn--'),
      hasSensitiveKeywords: /login|verify|update|account|secure|banking|signin|confirm/.test(hostname),
      suspiciousTld: /\.(top|xyz|bid|info|online|site|icu|buzz|gq|tk|ml|ga|cf)$/.test(hostname)
    };

    let heuristicScore = 0;
    if (features.length > 75) heuristicScore += 15;
    if (features.dots > 3) heuristicScore += 10;
    if (features.hasAt) heuristicScore += 30;
    if (features.hasHyphen) heuristicScore += 5;
    if (features.isIp) heuristicScore += 50;
    if (features.excessiveSubdomains) heuristicScore += 30;
    else if (features.subdomains > 2) heuristicScore += 15;
    if (features.isShortened) heuristicScore += 20;
    if (features.hasSpecialChars) heuristicScore += 25;
    if (features.isPunycode) heuristicScore += 40; // High risk for homograph attacks
    if (features.hasSensitiveKeywords) heuristicScore += 20;
    if (features.suspiciousTld) heuristicScore += 15;

    return { features, heuristicScore: Math.min(heuristicScore, 100) };
  } catch (e) {
    return null;
  }
};
