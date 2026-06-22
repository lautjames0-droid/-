import React, { useState, useEffect, useRef } from "react";
import { 
  Languages, 
  ArrowRightLeft, 
  Copy, 
  Check, 
  Volume2, 
  VolumeX, 
  Trash2, 
  Clipboard, 
  Loader2, 
  Sparkles, 
  Clock, 
  ArrowRight, 
  HelpCircle, 
  Mic, 
  MicOff,
  History,
  Info,
  X,
  Languages as LangIcon,
  RotateCcw,
  Upload,
  Image,
  FileText,
  Settings,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface HistoryItem {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLang?: string;
  timestamp: number;
}

export default function App() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLang, setSourceLang] = useState<string>("auto");
  const [targetLang, setTargetLang] = useState<string>("en");
  const [detectedLang, setDetectedLang] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Toggles and options
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // Copy feedback states
  const [copyOriginalSuccess, setCopyOriginalSuccess] = useState(false);
  const [copyTargetSuccess, setCopyTargetSuccess] = useState(false);
  
  // Speech states
  const [speakingOrig, setSpeakingOrig] = useState(false);
  const [speakingTrans, setSpeakingTrans] = useState(false);

  // Translation Style State (Standard vs Colloquial)
  const [translationStyle, setTranslationStyle] = useState<"standard" | "colloquial">("colloquial");

  // Custom PWA & LLM Settings States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [clientApiKey, setClientApiKey] = useState(() => {
    return localStorage.getItem("yiren_client_api_key") || "";
  });
  const [apiProvider, setApiProvider] = useState<"gemini" | "openai" | "deepseek" | "custom">(() => {
    return (localStorage.getItem("yiren_api_provider") as any) || "gemini";
  });
  const [customEndpoint, setCustomEndpoint] = useState(() => {
    return localStorage.getItem("yiren_custom_endpoint") || "";
  });
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("yiren_selected_model") || "gemini-2.5-flash";
  });

  const handleProviderChange = (provider: "gemini" | "openai" | "deepseek" | "custom") => {
    setApiProvider(provider);
    if (provider === "gemini") {
      setSelectedModel("gemini-2.5-flash");
    } else if (provider === "openai") {
      setSelectedModel("gpt-4o-mini");
    } else if (provider === "deepseek") {
      setSelectedModel("deepseek-chat");
    } else {
      setSelectedModel("");
    }
  };
  const [temperature, setTemperature] = useState(() => {
    const saved = localStorage.getItem("yiren_temperature");
    return saved ? parseFloat(saved) : 0.3;
  });
  const [customPrompt, setCustomPrompt] = useState(() => {
    return localStorage.getItem("yiren_custom_prompt") || "";
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadProject = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const response = await fetch("/api/download");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "打包下载请求失败");
      }
      // Get the binary blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "yiren-translate-project.tar.gz";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError("全代码工程打包下载失败: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem("translator_history_v1");
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    }
  }, []);

  // Sync history to localStorage
  const saveHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem("translator_history_v1", JSON.stringify(newHistory));
  };

  // State & Refs for File Upload and Image OCR
  const [fileLoading, setFileLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // File Upload Text Extraction
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setInputText(text);
      }
      setFileLoading(false);
    };
    reader.onerror = () => {
      alert("读取文件失败");
      setFileLoading(false);
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset value for future actions
  };

  // Image Upload and OCR Transcription
  const handleImageUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("请选择有效的图片文件");
      return;
    }

    setOcrLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      try {
        const response = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mimeType: file.type })
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `服务器状态: ${response.status}`);
        }
        const data = await response.json();
        if (data.text && data.text.trim()) {
          setInputText((prev) => prev ? prev.trim() + "\n" + data.text : data.text);
        } else {
          alert("未能在此图片中识别到任何文字");
        }
      } catch (err: any) {
        console.error(err);
        alert(err.message || "识图翻译发生错误，请稍后重试");
      } finally {
        setOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerImageFileSelect = () => {
    if (imageInputRef.current) {
      imageInputRef.current.click();
    }
  };

  // Simple clipboard image capture
  const handlePasteImageFromClipboard = () => {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      // Browser doesn't support reading clipboard programmatically, fallback to file select
      triggerImageFileSelect();
      return;
    }

    navigator.clipboard.read()
      .then(items => {
        let imageFound = false;
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith("image/"));
          if (imageType) {
            imageFound = true;
            item.getType(imageType).then(blob => {
              const file = new File([blob], "pasted_image.png", { type: blob.type });
              handleImageUpload(file);
            });
            break;
          }
        }
        if (!imageFound) {
          triggerImageFileSelect();
        }
      })
      .catch(() => {
        triggerImageFileSelect();
      });
  };

  // Intercept paste event on text area for images
  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault(); // Prevent pasting raw file representation
        const file = item.getAsFile();
        if (file) {
          handleImageUpload(file);
        }
        break;
      }
    }
  };

  // Perform Translation
  const handleTranslate = async (
    textToTranslate: string = inputText, 
    src: string = sourceLang, 
    tgt: string = targetLang, 
    style: "standard" | "colloquial" = translationStyle
  ) => {
    const trimmed = textToTranslate.trim();
    if (!trimmed) {
      setTranslatedText("");
      setDetectedLang("");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let finalTranslatedText = "";
      let finalDetectedLanguage = "";

      if (!clientApiKey.trim()) {
        throw new Error("检测到您尚未设置 API 密钥。请点击页面右上角「设置」或提示栏「立即配置 API」配置您的密钥以开始翻译。");
      }

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

        const sourceDisplay = langNames[src] || src;
        const targetDisplay = langNames[tgt] || tgt;

        let styleInstruction = "";
        if (style === "colloquial") {
          styleInstruction = "Please translate in a warm, colloquial, friendly daily spoken style. Ensure it sounds very natural and standard in the target language.";
        } else {
          styleInstruction = "Please translate in a highly professional, accurate, standard literary/business style.";
        }

        if (customPrompt.trim()) {
          styleInstruction += `\nAdditional user guidelines: ${customPrompt}`;
        }

        const prompt = `You are a professional compiler & translation engine. Translate the following input text precisely.
Input text to translate (raw text enclosed in triple quotes):
"""
${trimmed}
"""

Source language details: "${sourceDisplay}". If source language is "auto", inspect the input text and detect whether it is Chinese (zh), English (en), Indonesian (id), Thai (th), Vietnamese (vi), Filipino (fil), Russian (ru), Spanish (es), or Portuguese (pt), then translate it to ${targetDisplay}.
Target Language: "${targetDisplay}".

${styleInstruction}

Return your result strictly in the requested JSON structure. Do not include markdown formatting like \`\`\`json outside the content, just output raw JSON text containing:
{
  "translatedText": "the actual translated text",
  "detectedLanguage": "the ISO 639-1 code of the original text, must be one of 'zh', 'en', 'id', 'th', 'vi', 'fil', 'ru', 'es', or 'pt'"
}`;

        if (apiProvider === "gemini") {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${clientApiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: temperature,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    translatedText: { type: "STRING" },
                    detectedLanguage: {
                      type: "STRING",
                      description: "The ISO 639-1 language code detected for the original text. Must be one of 'zh', 'en', 'id', 'th', 'vi', 'fil', 'ru', 'es', or 'pt'."
                    }
                  },
                  required: ["translatedText", "detectedLanguage"]
                }
              },
              systemInstruction: {
                parts: [{
                  text: "You are a professional translator expert in multiple languages. Your goal is to deliver beautiful, fluid, and culturally-accurate translations matching the translation style selected by the user."
                }]
              }
            })
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const errMsg = errBody?.error?.message || `HTTP 错误: ${res.status}`;
            throw new Error(`直接连接 Gemini 失败: ${errMsg}`);
          }

          const resData = await res.json();
          const textResponse = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!textResponse) {
            throw new Error("Gemini API 返回了空响应，请检查密钥或翻译文本。");
          }

          const parsed = JSON.parse(textResponse);
          finalTranslatedText = parsed.translatedText;
          finalDetectedLanguage = parsed.detectedLanguage;
        } else {
          // OpenAI, DeepSeek, or Custom OpenAI-compatible endpoint
          let baseUrl = "https://api.openai.com/v1";
          if (apiProvider === "deepseek") {
            baseUrl = "https://api.deepseek.com/v1";
          } else if (apiProvider === "custom") {
            baseUrl = customEndpoint.trim() || "https://api.openai.com/v1";
          }
          // Remove trailing slash
          if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, -1);
          }

          const url = `${baseUrl}/chat/completions`;
          const chatHeaders: Record<string, string> = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${clientApiKey}`
          };

          const chatBody: any = {
            model: selectedModel || "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a professional translator expert in multiple languages. Your goal is to deliver beautiful, fluid, and culturally-accurate translations matching the translation style selected by the user. You must output a JSON object containing: {\"translatedText\": \"...\", \"detectedLanguage\": \"...\"}, where detectedLanguage is one of 'zh', 'en', 'id', 'th', 'vi', 'fil', 'ru', 'es', 'pt'."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: temperature
          };

          if (apiProvider === "openai") {
            chatBody.response_format = { type: "json_object" };
          }

          const res = await fetch(url, {
            method: "POST",
            headers: chatHeaders,
            body: JSON.stringify(chatBody)
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const errMsg = errBody?.error?.message || `HTTP 错误: ${res.status}`;
            throw new Error(`直接连接 ${apiProvider} 失败: ${errMsg}`);
          }

          const resData = await res.json();
          const textResponse = resData?.choices?.[0]?.message?.content;
          if (!textResponse) {
            throw new Error(`${apiProvider} API 返回了空响应，请检查密钥或翻译文本。`);
          }

          let cleanedJson = textResponse.trim();
          if (cleanedJson.startsWith("```")) {
            cleanedJson = cleanedJson.replace(/^```(json)?\n?/, "");
          }
          if (cleanedJson.endsWith("```")) {
            cleanedJson = cleanedJson.replace(/\n?```$/, "");
          }
          cleanedJson = cleanedJson.trim();

          try {
            const parsed = JSON.parse(cleanedJson);
            finalTranslatedText = parsed.translatedText;
            finalDetectedLanguage = parsed.detectedLanguage;
          } catch (parseErr) {
            console.error("JSON parse failed, falling back to plaintext:", cleanedJson);
            finalTranslatedText = textResponse;
            finalDetectedLanguage = src === "auto" ? "zh" : src; // fallback
          }
        }

      setTranslatedText(finalTranslatedText);
      setDetectedLang(finalDetectedLanguage);

      // Add to history list if it's new and has content
      if (trimmed.length > 1) {
        const isDuplicate = history.some(h => 
          h.originalText.trim() === trimmed && 
          h.targetLang === tgt && 
          h.sourceLang === src
        );

        if (!isDuplicate) {
          const newItem: HistoryItem = {
            id: Math.random().toString(36).substr(2, 9),
            originalText: trimmed,
            translatedText: finalTranslatedText,
            sourceLang: src,
            targetLang: tgt,
            detectedLang: finalDetectedLanguage,
            timestamp: Date.now()
          };
          saveHistory([newItem, ...history.slice(0, 19)]); // Keep top 20
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // Debounced translation when input text or settings change
  useEffect(() => {
    if (!autoTranslate) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!inputText.trim()) {
      setTranslatedText("");
      setDetectedLang("");
      return;
    }

    debounceTimeoutRef.current = setTimeout(() => {
      handleTranslate(inputText, sourceLang, targetLang, translationStyle);
    }, 820); // Comfortable debounce to save API usage

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [inputText, sourceLang, targetLang, autoTranslate, translationStyle]);

  // Adjust source language when it matches target language to make translating intuitive
  useEffect(() => {
    if (sourceLang !== "auto" && sourceLang === targetLang) {
      // Shift target to a different valid language
      const options = ["zh", "en", "id", "th", "vi", "fil", "ru", "es", "pt"];
      const nextTarget = options.find(o => o !== sourceLang);
      if (nextTarget) {
        setTargetLang(nextTarget);
      }
    }
  }, [sourceLang]);

  // Swap Source and Target Languages
  const handleSwapLanguages = () => {
    if (sourceLang === "auto") {
      // If auto, try swapping based on detected range or fallback
      const currentDetected = (detectedLang as any) || "zh";
      setSourceLang(targetLang as any);
      setTargetLang(currentDetected === targetLang ? (targetLang === "zh" ? "en" : "zh") : currentDetected);
    } else {
      const prevSource = sourceLang;
      setSourceLang(targetLang as any);
      setTargetLang(prevSource);
    }
    // Also swap translation text for maximum convenience
    if (translatedText) {
      const tempIn = inputText;
      setInputText(translatedText);
      setTranslatedText(tempIn);
    }
  };

  // Browser SpeechSynthesis TTS helper
  const speak = (text: string, langCode: string, isOriginal: boolean) => {
    if (!window.speechSynthesis) return;

    if (isOriginal && speakingOrig) {
      window.speechSynthesis.cancel();
      setSpeakingOrig(false);
      return;
    }
    if (!isOriginal && speakingTrans) {
      window.speechSynthesis.cancel();
      setSpeakingTrans(false);
      return;
    }

    window.speechSynthesis.cancel();
    if (isOriginal) {
      setSpeakingOrig(true);
      setSpeakingTrans(false);
    } else {
      setSpeakingTrans(true);
      setSpeakingOrig(false);
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Voice/lang mapping
    if (langCode === "zh") {
      utterance.lang = "zh-CN";
    } else if (langCode === "id") {
      utterance.lang = "id-ID";
    } else if (langCode === "th") {
      utterance.lang = "th-TH";
    } else if (langCode === "vi") {
      utterance.lang = "vi-VN";
    } else if (langCode === "fil") {
      utterance.lang = "fil-PH";
    } else if (langCode === "ru") {
      utterance.lang = "ru-RU";
    } else if (langCode === "es") {
      utterance.lang = "es-ES";
    } else if (langCode === "pt") {
      utterance.lang = "pt-PT";
    } else {
      utterance.lang = "en-US";
    }

    utterance.onend = () => {
      if (isOriginal) setSpeakingOrig(false);
      else setSpeakingTrans(false);
    };

    utterance.onerror = () => {
      if (isOriginal) setSpeakingOrig(false);
      else setSpeakingTrans(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Browser SpeechRecognition Voice Input
  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("您的浏览器暂不支持语音输入功能。支持该功能的浏览器有 Chrome, Edge, Safari 等。");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;

    // Determine listening language based on source language config
    const langMap: Record<string, string> = {
      zh: "zh-CN",
      en: "en-US",
      id: "id-ID",
      th: "th-TH",
      vi: "vi-VN",
      fil: "fil-PH",
      ru: "ru-RU",
      es: "es-ES",
      pt: "pt-PT"
    };
    const currentLang = sourceLang === "auto" ? detectedLang : sourceLang;
    const listenCode = langMap[currentLang || ""] || "zh-CN";

    rec.lang = listenCode;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      if (resultText) {
        setInputText((prev) => prev ? prev.trim() + " " + resultText : resultText);
      }
    };

    rec.onerror = (e: any) => {
      console.error("Speech Recognition Error", e);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
  };

  // Clipboard Copiers
  const copyToClipboard = (text: string, setSuccess: React.Dispatch<React.SetStateAction<boolean>>) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    }).catch(e => console.error("Clipboard copy failed", e));
  };

  // Clipboard Paster
  const handlePasteOriginal = () => {
    navigator.clipboard.readText().then(text => {
      if (text) setInputText(text);
    }).catch(err => {
      console.warn("Clipboard read permission blocked, using standard alert placeholder.", err);
    });
  };

  // History Actions
  const applyHistoryItem = (item: HistoryItem) => {
    setInputText(item.originalText);
    setTranslatedText(item.translatedText);
    setSourceLang(item.sourceLang as any);
    setTargetLang(item.targetLang as any);
    if (item.detectedLang) setDetectedLang(item.detectedLang);
    // Scroll to top nicely
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = history.filter(h => h.id !== id);
    saveHistory(filtered);
  };

  const clearAllHistory = () => {
    if (confirm("确定要清空所有翻译历史记录吗？")) {
      saveHistory([]);
    }
  };

  // Get display names
  const getLanguageName = (code: string) => {
    switch (code) {
      case "auto": return "自动检测";
      case "zh": return "中文";
      case "en": return "英文";
      case "id": return "印尼文";
      case "th": return "泰语";
      case "vi": return "越南语";
      case "fil": return "菲律宾语";
      case "ru": return "俄语";
      case "es": return "西班牙语";
      case "pt": return "葡萄牙语";
      default: return code;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-12 flex flex-col">
      {/* Top Navigation Bar from Clean Minimalism */}
      <nav className="h-16 px-6 sm:px-8 flex items-center justify-between bg-white border-b border-slate-200 sticky top-0 z-10 shadow-3xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm select-none">
            译
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            亦仁翻译
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* Style Configurator in top right menu bar */}
          <div className="flex bg-slate-100 p-0.5 rounded-full border border-slate-200/50">
            <button
              onClick={() => {
                setTranslationStyle("standard");
                handleTranslate(inputText, sourceLang, targetLang, "standard");
              }}
              className={`px-3 sm:px-4 py-1 text-xs font-bold rounded-full transition-all cursor-pointer select-none ${
                translationStyle === "standard"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="专业严谨、字面对应的标准直译"
            >
              💼 标准直译
            </button>
            <button
              onClick={() => {
                setTranslationStyle("colloquial");
                handleTranslate(inputText, sourceLang, targetLang, "colloquial");
              }}
              className={`px-3 sm:px-4 py-1 text-xs font-bold rounded-full transition-all cursor-pointer select-none ${
                translationStyle === "colloquial"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="通俗自然、日常会话的简单口语"
            >
              💬 简单口语
            </button>
          </div>

          {/* Toggle Translation History Drawer */}
          <button
            onClick={() => setIsHistoryDrawerOpen(true)}
            className={`px-3 sm:px-4 py-1 text-xs font-bold rounded-full border transition-all cursor-pointer select-none flex items-center gap-1.5 ${
              isHistoryDrawerOpen
                ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 shadow-3xs"
            }`}
            title="查看历史翻译记录"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">翻译历史</span>
            {history.length > 0 && (
              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">
                {history.length}
              </span>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 sm:px-4 py-1.5 text-xs font-bold rounded-full border transition-all cursor-pointer select-none flex items-center gap-1.5 bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 shadow-3xs"
            title="独立配置大语言模型 (Config LLM Settings)"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>设置</span>
          </button>

          {/* Download Project Button */}
          <button
            onClick={handleDownloadProject}
            disabled={isExporting}
            className={`px-3 sm:px-4 py-1.5 text-xs font-bold rounded-full border transition-all cursor-pointer select-none flex items-center gap-1.5 shadow-3xs ${
              isExporting
                ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700/95 hover:shadow-2xs active:scale-97"
            }`}
            title="一键打包并下载全部项目源代码"
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? "animate-bounce" : ""}`} />
            <span>{isExporting ? "正在打包..." : "下载代码"}</span>
          </button>
        </div>
      </nav>

      {/* Main Translation Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-6 flex flex-col gap-6">

        {/* API Key Missing Alert Banner */}
        {!clientApiKey && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4.5 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-3xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-100/80 rounded-xl flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                <Settings className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-indigo-950">欢迎开启 100% 独立隐私翻译！</h3>
                <p className="text-xs text-indigo-700/90 mt-1 leading-relaxed">
                  本产品已完全下线系统内置中转，切换为 <b>纯本地客户端（零服务器）直连模式</b>。安全无痕，零数据上云。请点击页面右上角 <b>「设置」</b> 输入您的 API 密钥（Gemini / OpenAI / DeepSeek 或任意兼容中转接口），即可无缝开始轻量、自由的顶级智能翻译。
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700/95 rounded-xl cursor-pointer shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              立即配置 API
            </button>
          </div>
        )}

        {/* Languages Selection Row - Aligned with below left (input) and right (output) panels */}
        <div className="relative grid grid-cols-2 gap-4 sm:gap-6 items-center -mb-2 mt-2 w-full">
          {/* Left language selector (Source select) */}
          <div className="w-full">
            <div className="w-full flex items-center justify-center gap-1.5 bg-white border border-slate-200 shadow-3xs rounded-xl px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider select-none">源语言 &middot;</span>
              <select 
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value as any)}
                className="bg-transparent font-bold text-xs text-slate-700 hover:text-indigo-600 cursor-pointer outline-none border-none pr-1 focus:ring-0 text-center"
              >
                <option value="auto">
                  {detectedLang ? `自动检测 (${getLanguageName(detectedLang)})` : "自动检测"}
                </option>
                <option value="zh">中文 (Chinese)</option>
                <option value="en">English (英文)</option>
                <option value="id">Indonesia (印尼文)</option>
                <option value="th">泰语 (Thai)</option>
                <option value="vi">越南语 (Vietnamese)</option>
                <option value="fil">菲律宾语 (Filipino)</option>
                <option value="ru">俄语 (Russian)</option>
                <option value="es">西班牙语 (Spanish)</option>
                <option value="pt">葡萄牙语 (Portuguese)</option>
              </select>
            </div>
          </div>
          
          {/* Absolute centered Swap button, sitting precisely in the middle column gap */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center">
            <button 
              onClick={handleSwapLanguages}
              className="p-1.5 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 rounded-full transition-all group border border-slate-200 bg-white shadow-2xs active:scale-90 cursor-pointer flex items-center justify-center"
              title="互换语种"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 group-hover:rotate-180 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </div>

          {/* Right language selector (Target select) */}
          <div className="w-full">
            <div className="w-full flex items-center justify-center gap-1.5 bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-2.5 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
              <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider select-none">目标语言 &middot;</span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value as any)}
                className="bg-transparent font-bold text-xs text-indigo-700 hover:text-indigo-900 cursor-pointer outline-none border-none pr-1 focus:ring-0 text-center"
              >
                <option value="zh">中文 (Chinese)</option>
                <option value="en">English (英文)</option>
                <option value="id">Indonesia (印尼文)</option>
                <option value="th">泰语 (Thai)</option>
                <option value="vi">越南语 (Vietnamese)</option>
                <option value="fil">菲律宾语 (Filipino)</option>
                <option value="ru">俄语 (Russian)</option>
                <option value="es">西班牙语 (Spanish)</option>
                <option value="pt">葡萄牙语 (Portuguese)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Core Inputs Grid */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 items-stretch">
          
          {/* Source Input Area (Clean Minimalism Card) */}
          <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-colors overflow-hidden min-h-[360px] relative">
            
            {/* Optional OCR or File Upload Loading Spinner */}
            {(fileLoading || ocrLoading) && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex flex-col items-center justify-center rounded-2xl z-20">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                <span className="text-xs text-slate-600 font-bold">
                  {fileLoading ? "正在解析文件内容..." : "正在提取图片文本 (Gemini OCR)..."}
                </span>
              </div>
            )}

            <div className="flex-1 p-6 sm:p-8 relative flex flex-col">
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handleTextareaPaste}
                placeholder={
                  sourceLang === "zh"
                    ? "请输入或选择要翻译的中文内容 (支持粘贴图片/拖入文件)..."
                    : sourceLang === "id"
                    ? "Masukkan teks Bahasa Indonesia (mendukung tempel gambar/berkas)..."
                    : "Type, paste text, or drop file/image for translation..."
                }
                maxLength={4500}
                className="w-full h-full text-lg md:text-xl lg:text-2xl font-normal text-slate-800 placeholder-slate-300 resize-none outline-none leading-relaxed min-h-[220px]"
                id="original_text_input"
              />
              {inputText && (
                <button
                  onClick={() => setInputText("")}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  title="清空"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
            
            {/* Source Footer Toolbar */}
            <div className="h-14 px-6 flex items-center justify-between bg-slate-50 border-t border-slate-100">
              <div className="flex gap-3">
                {/* Voice capture button */}
                <button
                  onClick={startVoiceInput}
                  className={`p-2 rounded-xl transition-all ${
                    isListening 
                      ? "bg-red-500 text-white animate-pulse" 
                      : "text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50"
                  }`}
                  title={isListening ? "停止语音输入" : "语音输入"}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {/* Text-to-speech button */}
                <button
                  onClick={() => speak(inputText, sourceLang === "auto" ? detectedLang : sourceLang, true)}
                  disabled={!inputText.trim()}
                  className={`p-2 rounded-xl transition-all ${
                    speakingOrig
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 disabled:opacity-30 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                  }`}
                  title="播放源文本语音"
                >
                  <Volume2 className="w-5 h-5" />
                </button>

                {/* Paste button */}
                <button
                  onClick={handlePasteOriginal}
                  className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 transition-all"
                  title="粘入剪贴板文本"
                >
                  <Clipboard className="w-5 h-5" />
                </button>

                {/* Upload File button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 transition-all cursor-pointer"
                  title="上传文本文件 (.txt, .md, .csv)"
                >
                  <Upload className="w-5 h-5" />
                </button>

                {/* Paste/Upload Image button */}
                <button
                  onClick={handlePasteImageFromClipboard}
                  className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50 transition-all cursor-pointer"
                  title="粘贴/上传图片识文 (可直接Ctrl+V粘贴)"
                >
                  <Image className="w-5 h-5" />
                </button>

                {/* Hidden File Inputs */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".txt,.md,.json,.csv,.js,.ts" 
                  className="hidden" 
                />
                <input 
                  type="file" 
                  ref={imageInputRef} 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = "";
                  }} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                {inputText.length} / 4500
              </span>
            </div>
          </div>

          {/* Target Output Area (Clean Minimalism Card - Indigo themed) */}
          <div className="flex flex-col bg-indigo-50/20 rounded-2xl border border-indigo-100 shadow-xs overflow-hidden min-h-[360px] relative">
            
            {/* Translator Loading Cover */}
            <AnimatePresence>
              {loading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  id="loading_overlay" 
                  className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center z-10 transition-all"
                >
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                  <span className="text-xs text-indigo-600 font-bold select-none tracking-wider">
                    Gemini 智能AI翻译中...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Overlay banner */}
            {error && (
              <div className="p-4 bg-red-50 border-b border-red-100 text-sm text-red-600 flex items-start gap-2.5">
                <Info className="w-5 h-5 text-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-xs">翻译失败: {error}</p>
                </div>
              </div>
            )}

            {/* Target Output core area */}
            <div className="flex-1 p-6 sm:p-8 flex flex-col">
              {translatedText ? (
                <p className="text-lg md:text-xl lg:text-2xl font-normal text-slate-900 leading-relaxed whitespace-pre-wrap select-text">
                  {translatedText}
                </p>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-slate-400">
                  <LangIcon className="w-10 h-10 text-indigo-200/80 mb-3 stroke-1" />
                  <p className="text-sm font-medium text-slate-400">
                    译文将自动显示在此
                  </p>
                  <p className="text-xs text-slate-400/80 mt-1 max-w-xs text-center">
                    支持中文、英文与印尼语双向转换，输入文本后将即刻由 AI 完美诠释
                  </p>
                </div>
              )}
            </div>

            {/* Target Footer Toolbar */}
            <div className="h-14 px-6 flex items-center justify-between bg-indigo-50/40 border-t border-indigo-100">
              <div className="flex gap-3">
                {/* Speak target language */}
                <button
                  onClick={() => speak(translatedText, targetLang, false)}
                  disabled={!translatedText}
                  className={`p-2 rounded-xl transition-all ${
                    speakingTrans
                      ? "bg-indigo-600 text-white"
                      : "text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/50 disabled:opacity-30 disabled:hover:text-indigo-400 disabled:hover:bg-transparent"
                  }`}
                  title="播放译文语音"
                >
                  <Volume2 className="w-5 h-5" />
                </button>

                {/* Copy translated text */}
                <button
                  onClick={() => copyToClipboard(translatedText, setCopyTargetSuccess)}
                  disabled={!translatedText}
                  className={`p-2 rounded-xl transition-all relative ${
                    copyTargetSuccess
                      ? "text-green-600"
                      : "text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/50 disabled:opacity-30 disabled:hover:text-indigo-400 disabled:hover:bg-transparent"
                  }`}
                  title="复制翻译文本"
                >
                  {copyTargetSuccess ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  <AnimatePresence>
                    {copyTargetSuccess && (
                      <motion.span
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: -20 }}
                        exit={{ opacity: 0 }}
                        className="absolute text-[10px] font-bold bg-green-600 text-white px-2 py-0.5 rounded-md -top-6 whitespace-nowrap shadow-sm"
                      >
                        已复制
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>

              {/* Translate Control panel */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none text-indigo-600/80 font-medium hover:text-indigo-800">
                  <input
                    type="checkbox"
                    checked={autoTranslate}
                    onChange={(e) => setAutoTranslate(e.target.checked)}
                    className="rounded-sm accent-indigo-600 text-indigo-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>实时翻译</span>
                </label>

                {!autoTranslate && (
                  <button
                    onClick={() => handleTranslate(inputText, sourceLang, targetLang, translationStyle)}
                    className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-indigo-700 active:scale-95 transition-all shadow-sm cursor-pointer"
                  >
                    翻译
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Utility Grid - Inspired by clean layouts from Minimalist HTML */}
        <footer className="grid grid-cols-1 sm:grid-cols-3 gap-4 h-auto pt-2">
          {/* Item 1 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 shadow-xs">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Mic className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Voice Input</p>
              <p className="text-sm font-medium text-slate-700">支持流畅语音录入</p>
            </div>
          </div>
          {/* Item 2 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 shadow-xs">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Volume2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Audio Narration</p>
              <p className="text-sm font-medium text-slate-700">双向自然原声播报</p>
            </div>
          </div>
          {/* Item 3 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 shadow-xs">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Sparkles className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Gemini Engine</p>
              <p className="text-sm font-medium text-slate-700">三语深度场景智能直译</p>
            </div>
          </div>
        </footer>

      </main>

      {/* Side Slide-over History Drawer */}
      <AnimatePresence>
        {isHistoryDrawerOpen && (
          <>
            {/* Backdrop cover */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryDrawerOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 transition-opacity"
            />

            {/* Sliding Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
            >
              {/* Header */}
              <div className="h-16 px-6 border-b border-slate-150 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-semibold text-slate-900 text-base">最近翻译历史</h3>
                  <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-mono font-bold">
                    {history.length}
                  </span>
                </div>
                <button
                  onClick={() => setIsHistoryDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-105 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length > 0 ? (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          applyHistoryItem(item);
                          setIsHistoryDrawerOpen(false); // close list after application
                        }}
                        className="group border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/20 p-4 rounded-xl text-left cursor-pointer transition-all flex justify-between items-start gap-4 relative shadow-2xs hover:shadow-xs"
                      >
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 tracking-wider uppercase font-mono">
                            <span>{getLanguageName(item.sourceLang)}</span>
                            <ArrowRight className="w-3 h-3 text-indigo-400" strokeWidth={3} />
                            <span>{getLanguageName(item.targetLang)}</span>
                            {item.detectedLang && item.sourceLang === "auto" && (
                              <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.1 select-none font-sans rounded-xs text-[9px]">
                                检测: {getLanguageName(item.detectedLang)}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-semibold text-slate-700 truncate">
                            {item.originalText}
                          </p>
                          <p className="text-xs font-medium text-indigo-600 truncate opacity-90">
                            {item.translatedText}
                          </p>
                        </div>

                        <button
                          onClick={(e) => deleteHistoryItem(item.id, e)}
                          className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-slate-100 transition-colors"
                          title="删除记录"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 text-slate-400">
                    <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-500">暂无翻译历史</p>
                    <p className="text-xs text-slate-400/85 mt-1 max-w-xs mx-auto">
                      您的所有翻译会得到完美保护并安全保留于本地浏览器中
                    </p>
                  </div>
                )}
              </div>

              {/* Utility Footer inside Drawer */}
              {history.length > 0 && (
                <div className="p-4 border-t border-slate-150 bg-slate-50 flex justify-end">
                  <button
                    onClick={clearAllHistory}
                    className="w-full py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>清空所有历史</span>
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Custom LLM configuration Modal (PWA Settings) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Settings className="w-4 h-4 animate-spin-slow" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">翻译引擎与 PWA 配置</h3>
                    <p className="text-[10px] text-slate-400">零服务器纯本地运行 / 接入个人大语言模型</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-105 rounded-xl cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-5">
                {/* API Provider Selector */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">模型接口供应商 (API Provider)</label>
                      <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                        {(["gemini", "openai", "deepseek", "custom"] as const).map((prov) => (
                          <button
                            key={prov}
                            type="button"
                            onClick={() => handleProviderChange(prov)}
                            className={`py-1.5 px-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center select-none ${
                              apiProvider === prov
                                ? "bg-white text-indigo-600 shadow-3xs"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {prov === "gemini" ? "Gemini" : prov === "openai" ? "OpenAI" : prov === "deepseek" ? "DeepSeek" : "自定义"}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        支持任意 OpenAI 兼容中转站，极方便规避 Google API 限制与付款障碍。
                      </p>
                    </div>

                    {/* Custom endpoint base URL for Custom provider */}
                    {apiProvider === "custom" && (
                      <div>
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">API 根地址 (API Base URL)</label>
                        <input
                          type="text"
                          placeholder="例如：https://api.siliconflow.cn/v1 或其它中转站反代"
                          value={customEndpoint}
                          onChange={(e) => setCustomEndpoint(e.target.value)}
                          className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all placeholder:text-slate-300"
                        />
                        <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                          请输入兼容 OpenAI chat/completions 格式的接口代理基准地址。
                        </p>
                      </div>
                    )}

                    {/* Dynamic API Key */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                          {apiProvider === "gemini" 
                            ? "Google Gemini API 密钥 (Key)" 
                            : apiProvider === "openai" 
                              ? "OpenAI API 密钥 (API Key)" 
                              : apiProvider === "deepseek" 
                                ? "DeepSeek API 密钥 (API Key)" 
                                : "API 访问密钥 (API Key)"}
                        </label>
                        {apiProvider === "gemini" && (
                          <a 
                            href="https://aistudio.google.com/apikey" 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-[10px] text-indigo-500 hover:underline flex items-center gap-0.5"
                          >
                            获取免费密钥 <ArrowRight className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {apiProvider === "deepseek" && (
                          <a 
                            href="https://platform.deepseek.com" 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-[10px] text-indigo-500 hover:underline flex items-center gap-0.5"
                          >
                            极速获取密钥 <ArrowRight className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                      <input
                        type="password"
                        placeholder={
                          apiProvider === "gemini" 
                            ? "请输入您的 AIzaSy..." 
                            : apiProvider === "openai" 
                              ? "请输入您的 sk-..." 
                              : apiProvider === "deepseek" 
                                ? "请输入您的 sk-..." 
                                : "请输入对应中转站的 API 访问凭证 Key..."
                        }
                        value={clientApiKey}
                        onChange={(e) => setClientApiKey(e.target.value)}
                        className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all placeholder:text-slate-300"
                      />
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        您的 API Key 仅加密保存在当前浏览器的 LocalStorage 内，绝对不会上传到任何第三方或亦仁翻译服务器。
                      </p>
                    </div>

                    {/* Model Selector */}
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">选择大模型版本 (Model Selection)</label>
                      {apiProvider !== "custom" ? (
                        <select
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all font-bold text-slate-700 cursor-pointer"
                        >
                          {apiProvider === "gemini" && (
                            <>
                              <option value="gemini-2.5-flash">Gemini 2.5 Flash (超灵敏 - 响应快推荐)</option>
                              <option value="gemini-2.5-pro">Gemini 2.5 Pro (超高准确度 - 品质强荐)</option>
                              <option value="gemini-1.5-flash">Gemini 1.5 Flash (经典轻量引擎)</option>
                              <option value="gemini-1.5-pro">Gemini 1.5 Pro (精细翻译引擎)</option>
                            </>
                          )}
                          {apiProvider === "openai" && (
                            <>
                              <option value="gpt-4o-mini">GPT-4o Mini (最轻便推荐 - 翻译高性价比)</option>
                              <option value="gpt-4o">GPT-4o (王牌全能大模型 - 精细卓越)</option>
                              <option value="gpt-3.5-turbo">GPT-3.5 Turbo (经典高效率引擎)</option>
                            </>
                          )}
                          {apiProvider === "deepseek" && (
                            <>
                              <option value="deepseek-chat">DeepSeek V3 (极低售价 / 高拟人度 - 强力推荐)</option>
                              <option value="deepseek-coder">DeepSeek-Coder (专业技术语境)</option>
                            </>
                          )}
                        </select>
                      ) : (
                        <div>
                          <input
                            type="text"
                            placeholder="例如：deepseek-chat 或 gpt-4o-mini 或 claude-3-5-sonnet 等"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all placeholder:text-slate-400 font-bold"
                          />
                          <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                            请输入该自定义接口支持的 exact 模型标识（Model ID）。
                          </p>
                        </div>
                      )}
                    </div>

                {/* Temperature slider */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">创意发散度 (Temperature)</label>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                      {temperature}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer bg-slate-100"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                    <span>精确意译 (0.0)</span>
                    <span>传统平衡 (0.3)</span>
                    <span>创意拟人 (1.0)</span>
                  </div>
                </div>

                {/* Additional Translation Persona prompt instruction */}
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">自定义附加翻译提示词 (Custom Rules)</label>
                  <textarea
                    placeholder="例如：'请翻译得优雅通俗一些，保留中文书面语成语的气息' 或 '将专业术语严格按照行业规范在目标语言中对齐' ..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    rows={3}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all placeholder:text-slate-350 resize-none font-sans leading-relaxed text-slate-700"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                    您可以在这里输入定制化要求。您的输入会作为附加系统指令传递，指导 AI 打造完全属于您的专属翻译风格。
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setApiProvider("gemini");
                    setClientApiKey("");
                    setSelectedModel("gemini-2.5-flash");
                    setCustomEndpoint("");
                    setTemperature(0.3);
                    setCustomPrompt("");
                    localStorage.removeItem("yiren_api_provider");
                    localStorage.removeItem("yiren_client_api_key");
                    localStorage.removeItem("yiren_selected_model");
                    localStorage.removeItem("yiren_custom_endpoint");
                    localStorage.removeItem("yiren_temperature");
                    localStorage.removeItem("yiren_custom_prompt");
                    setIsSettingsOpen(false);
                  }}
                  className="px-3.5 py-1.5 text-xs text-slate-450 hover:text-slate-650 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer font-bold transition-colors"
                >
                  重置默认
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("yiren_api_provider", apiProvider);
                    localStorage.setItem("yiren_client_api_key", clientApiKey);
                    localStorage.setItem("yiren_selected_model", selectedModel);
                    localStorage.setItem("yiren_custom_endpoint", customEndpoint);
                    localStorage.setItem("yiren_temperature", temperature.toString());
                    localStorage.setItem("yiren_custom_prompt", customPrompt);
                    setIsSettingsOpen(false);
                    if (inputText.trim()) {
                      handleTranslate(inputText, sourceLang, targetLang, translationStyle);
                    }
                  }}
                  className="px-5 py-2 text-xs text-white bg-indigo-600 hover:bg-indigo-700/95 rounded-xl cursor-pointer font-bold shadow-xs transition-colors"
                >
                  保存并应用
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
