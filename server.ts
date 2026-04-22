import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ENCRYPTION HELPERS
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_character_long_string_'; // Must be 256 bits (32 characters)
  const IV_LENGTH = 16; 

  function encrypt(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  function decrypt(text) {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  // API ROUTES

  app.post("/api/keys/encrypt", (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) return res.status(400).json({ error: "Missing API Key" });
      const encrypted = encrypt(apiKey);
      return res.json({ encryptedKey: encrypted });
    } catch(err) {
      return res.status(500).json({ error: "Encryption failed" });
    }
  });

  app.post("/api/apify/generate", async (req, res) => {
    try {
      const { encryptedApiKey, place, industry, quantity, platform, emailToggle, painPoints } = req.body;
      if (!encryptedApiKey) return res.status(400).json({ error: "Missing Apify API Key" });

      const apifyKey = decrypt(encryptedApiKey);
      const { ApifyClient } = await import('apify-client');
      const client = new ApifyClient({ token: apifyKey });

      let siteFilter = `site:${platform.toLowerCase()}.com`;
      if (platform === 'LinkedIn') siteFilter = `site:linkedin.com/in`;
      if (platform === 'Skool') siteFilter = `site:skool.com`;
      if (platform === 'Discord') siteFilter = `site:discord.com OR "Discord"`;
      if (platform === 'Twitter') siteFilter = `site:twitter.com OR site:x.com`;
      if (platform === 'Email') siteFilter = ``;

      // Build extra search terms if painPoints provided
      // Roughly pull keywords out to make the search more targeted
      let extraTerms = '';
      if (painPoints && painPoints.length > 3) {
         // Create an OR block for pain points to broaden the Google lookup
         extraTerms = `(${painPoints.split(',').map((p: string) => `"${p.trim()}"`).join(' OR ')})`;
      }

      const query = `${siteFilter} "${industry}" "${place}" ${emailToggle ? '("@gmail.com" OR "@yahoo.com" OR "@hotmail.com")' : ''} ${extraTerms}`;
      
      const input = {
        queries: [query.trim()],
        maxPagesPerQuery: Math.ceil(quantity / 10) || 1, // rough estimate 10 per page
        resultsPerPage: Math.min(quantity, 100)
      };

      // Call Apify Google Search Scraper
      const run = await client.actor("apify/google-search-scraper").call(input);
      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      // Transform items into Leads format
      const leads = items.slice(0, quantity).map((item: any) => {
        // basic attempt to parse domain / emails from snippet
        const emailMatch = item.description?.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
        let name = item.title?.replace(/ - .*| \| .*/, '').trim() || "Unknown";
        
        return {
          name: name,
          profileUrl: item.url,
          bio: item.description,
          platform: platform,
          email: emailMatch && emailMatch.length > 0 ? emailMatch[0] : "",
          status: "Not Sent",
          label: "Unscored"
        };
      });

      res.json({ leads });
    } catch(err: any) {
      console.error("Apify Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate leads via Apify" });
    }
  });

  // VITE MIDDLEWARE OR STATIC FILES
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // For Express 4.x
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
