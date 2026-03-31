import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/check-safe-browsing", async (req, res) => {
    const { url } = req.body;
    const apiKey = process.env.SAFE_BROWSING_API_KEY;

    if (!apiKey) {
      return res.json({ isFlagged: false, message: "Safe Browsing API key not configured" });
    }

    try {
      const response = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: {
            clientId: "phishguard-ai",
            clientVersion: "1.0.0"
          },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }]
          }
        })
      });

      const data = await response.json();
      const isFlagged = data.matches && data.matches.length > 0;
      
      res.json({ 
        isFlagged, 
        matches: data.matches || [],
        message: isFlagged ? "URL is flagged by Google Safe Browsing" : "URL is not flagged"
      });
    } catch (error) {
      console.error("Safe Browsing API error:", error);
      res.status(500).json({ error: "Failed to check Safe Browsing" });
    }
  });

  app.post("/api/report-miss", (req, res) => {
    const { input, result, feedbackType } = req.body;
    
    // In a real production app, this would be saved to a database.
    // For now, we log it to the server console for audit/retraining.
    console.log("--- FEEDBACK RECEIVED ---");
    console.log(`Type: ${feedbackType}`);
    console.log(`Input: ${input}`);
    console.log(`AI Verdict: ${result.verdict} (Score: ${result.score})`);
    console.log("-------------------------");

    res.json({ success: true, message: "Feedback logged successfully" });
  });

  // Vite middleware for development
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
