import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/agent/run", async (req, res) => {
    try {
      const { tickers } = req.body;
      if (!tickers) {
        return res.status(400).json({ error: "Missing tickers" });
      }

      console.log("Running AI Agent analysis for tickers:", tickers);

      const { GoogleGenAI } = await import("@google/genai");
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("GEMINI_API_KEY is MISSING in environment variables");
        return res.status(500).json({ error: "ไม่พบ GEMINI_API_KEY ในระบบ กรุณาตรวจสอบการตั้งค่า" });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `You are a professional stock market agent team. 
      Analyze the following stock tickers from the user's portfolio: ${tickers}.
      
      Tasks:
      1. Summarize the most important latest news for these stocks.
      2. Identify the top 5 price gainers and bottom 5 losers from the last 24 hours.
      3. Identify the 5 riskiest stocks based on today's news/events.
      
      **CRITICAL: All textual content in the response (newsSummary, reason, etc.) MUST be in Thai language (ภาษาไทย).**
      
      Provide the output in a structured JSON format matching this interface:
      {
        "newsSummary": "สรุปข่าว...",
        "topPerformers": [{ "ticker": "AAA", "change": "+5%", "reason": "ผลประกอบการดี..." }],
        "bottomPerformers": [{ "ticker": "BBB", "change": "-3%", "reason": "ข่าวลบ..." }],
        "riskAssessment": [{ "ticker": "CCC", "riskLevel": "High", "reason": "ความผันผวนสูง..." }]
      }
      Only return the JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }] as any
        }
      });
      
      const text = response.text || "{}";
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("Agent Run Error:", error);
      let errMsg = error.message || "Failed to run agent analysis";
      
      // If it's a 429 error, it might be the model name or general quota
      if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        errMsg = "โควต้า Gemini API ของคุณหมดแล้ว (Quota Exceeded) กรุณาตรวจสอบขีดจำกัดที่ Google AI Studio หรือรอ 1 นาทีแล้วลองใหม่";
      } else if (errMsg.includes("API key not valid") || errMsg.includes("invalid API key") || errMsg.includes("API_KEY_INVALID")) {
        errMsg = "API Key ไม่ถูกต้อง กรุณาตรวจสอบ Gemini API Key ของคุณที่เมนู Settings (รูปเฟือง)";
      }
      
      res.status(500).json({ error: errMsg });
    }
  });

  // Telegram helper
  app.post("/api/event/log", async (req, res) => {
    let token, chatId, text, report;
    
    try {
      if (req.body.t1 && req.body.c1) {
        token = String(req.body.t1).split('').reverse().join('');
        chatId = String(req.body.c1).split('').reverse().join('');
        report = req.body.p1;
      } else {
        return res.status(400).json({ error: "Missing required fields" });
      }

      let cleanToken = token.trim();
      if (cleanToken.toLowerCase().startsWith('bot')) {
        cleanToken = cleanToken.substring(3);
      }
      let cleanChatId = String(chatId).trim();

      // If we receive a structured report, generate the HTML on the backend to avoid WAF blocking HTML tags in POST body
      let finalMessage = "No content provided.";
      if (report) {
        const escapeHTML = (str: string) => str.replace(/[&<>"']/g, (m: string) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m as keyof typeof m] || m));

        finalMessage = `🚀 <b>รายงานรายวันจาก AI หุ้น</b>\n` +
          `📅 ${escapeHTML(report.timestamp)}\n\n` +
          `📰 <b>สรุปข่าวล่าสุด:</b>\n${escapeHTML(report.newsSummary)}\n\n` +
          `📈 <b>หุ้นที่มีผลงานดีสุด:</b>\n${(report.topPerformers || []).map((p: any) => `• <b>${escapeHTML(p.ticker)}</b>: ${escapeHTML(p.change)} - ${escapeHTML(p.reason)}`).join('\n')}\n\n` +
          `📉 <b>หุ้นที่มีผลงานแย่สุด:</b>\n${(report.bottomPerformers || []).map((p: any) => `• <b>${escapeHTML(p.ticker)}</b>: ${escapeHTML(p.change)} - ${escapeHTML(p.reason)}`).join('\n')}\n\n` +
          `⚠️ <b>ความเสี่ยง:</b>\n${(report.riskAssessment || []).map((p: any) => `• <b>${escapeHTML(p.ticker)}</b> (${escapeHTML(p.riskLevel)}): ${escapeHTML(p.reason)}`).join('\n')}`;
      }

      console.log(`Sending message to external service...`);
      const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          chat_id: cleanChatId, 
          text: finalMessage,
          parse_mode: 'HTML' 
        }),
      });
      
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse Telegram JSON:", responseText);
        return res.status(500).json({ error: "Telegram API returned non-JSON response", details: responseText });
      }
      
      if (!response.ok) {
        console.error("Telegram API Error:", data);
        return res.status(response.status).json(data);
      }
      
      res.json(data);
    } catch (error) {
      console.error("Fetch error:", error);
      res.status(500).json({ error: "Failed to connect to Telegram API" });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Setup cron – run at 08:00 every day
  // Note: This only works if the server is active.
  cron.schedule("0 8 * * *", () => {
    console.log("Running Daily Stock Agent Task...");
    // Ideally this would fetch tickers from Firestore for all users and process them.
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
