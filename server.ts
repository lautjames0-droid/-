import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please add it via Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ocr", async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      if (!image) {
        return res.status(400).json({ error: "图像数据不能为空" });
      }

      const ai = getGeminiClient();

      // The image payload from request is base64 string. Strip out metadata header if present.
      let base64Data = image;
      if (image.includes(",")) {
        base64Data = image.split(",")[1];
      }

      const prompt = "Please transcribe all readable text (Chinese, English, and/or Indonesian) from this image. Do not translate the text. Preserve the original language and formatting/layout. Provide only the extracted text as accuracy is critical. Do not write any conversational preambles or explanations.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType || "image/jpeg"
            }
          },
          prompt
        ]
      });

      const extractedText = response.text || "";
      res.json({ text: extractedText.trim() });
    } catch (error: any) {
      console.error("OCR failed:", error);
      res.status(500).json({ error: error.message || "图像文本识别失败，请稍后重试" });
    }
  });

  app.post("/api/translate", async (req, res) => {
    try {
      const { text, sourceLang, targetLang, style } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "输入文本不能为空" });
      }
      if (!sourceLang || !targetLang) {
        return res.status(400).json({ error: "源语言和目标语言不能为空" });
      }

      const ai = getGeminiClient();

      // Mapping codes to clear language names
      const langNames: Record<string, string> = {
        auto: "检测语言 (Auto Detect)",
        zh: "中文 (Chinese)",
        en: "英文 (English)",
        id: "印尼文 (Indonesian)",
        th: "泰语 (Thai)",
        vi: "越南语 (Vietnamese)",
        fil: "菲律宾语 (Filipino)",
        ru: "俄语 (Russian)",
        es: "西班牙语 (Spanish)",
        pt: "葡萄牙语 (Portuguese)"
      };

      const sourceDisplay = langNames[sourceLang] || sourceLang;
      const targetDisplay = langNames[targetLang] || targetLang;

      const styleInstruction = style === "colloquial" 
        ? `Tone/Style: Colloquial and extremely simple spoken everyday language. Use natural patterns, common expressions, and friendly conversational phrasings. Avoid overly formal, academic, or stiff literal translations.`
        : `Tone/Style: Standard, polite, and professional translation. Natural but accurate phrasing.`;

      const prompt = `Translate the following input text to "${targetDisplay}".
Input Text to translate:
"""
${text}
"""

Source language details: "${sourceDisplay}". If source language is "auto", inspect the input text and detect whether it is Chinese (zh), English (en), Indonesian (id), Thai (th), Vietnamese (vi), Filipino (fil), Russian (ru), Spanish (es), or Portuguese (pt), then translate it to ${targetDisplay}.
Target Language: "${targetDisplay}".

${styleInstruction}

Provide the translation with high quality, proper tone, and natural phrasing matching the Style requirements. Do not add any extra explanatory text or comments. Respond ONLY with a valid JSON object matching the requested schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a professional translator expert in multiple languages including Chinese (zh), English (en), Indonesian (id), Thai (th), Vietnamese (vi), Filipino (fil), Russian (ru), Spanish (es), and Portuguese (pt). Your goal is to deliver beautiful, fluid, and culturally-accurate translations matching the translation style selected by the user. Return your result strictly in the requested JSON format.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translatedText: {
                type: Type.STRING,
                description: "The high-fidelity translation."
              },
              detectedLanguage: {
                type: Type.STRING,
                description: "The ISO 639-1 language code detected for the original text. Must be one of 'zh', 'en', 'id', 'th', 'vi', 'fil', 'ru', 'es', or 'pt'."
              }
            },
            required: ["translatedText", "detectedLanguage"]
          }
        }
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("No translation returned from Gemini model.");
      }

      const parsed = JSON.parse(resultText);
      res.json({
        translatedText: parsed.translatedText,
        detectedLanguage: parsed.detectedLanguage || "en",
      });
    } catch (error: any) {
      console.error("Translation failed:", error);
      res.status(500).json({ error: error.message || "翻译请求失败，请稍后重试" });
    }
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
