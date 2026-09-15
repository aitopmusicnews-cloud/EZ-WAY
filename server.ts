import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import multer from "multer";

// Helper with automatic fallback for 429 Rate Limit/Quota Errors
async function generateContentWithFallback(ai: GoogleGenAI, params: { model: string; contents: any; config?: any }) {
  try {
    return await ai.models.generateContent(params);
  } catch (err: any) {
    const isRateLimit = err?.message?.includes("429") || 
                        err?.message?.includes("Quota exceeded") || 
                        err?.message?.includes("RESOURCE_EXHAUSTED") ||
                        (err?.status && err.status === "RESOURCE_EXHAUSTED") ||
                        (err?.code && err.code === 429);
                        
    if (isRateLimit && params.model === "gemini-3.5-flash") {
      console.warn("Primary model gemini-3.5-flash rate limited (429/RESOURCE_EXHAUSTED). Dynamically falling back to gemini-3.1-flash-lite to protect service...");
      try {
        const fallbackParams = { ...params, model: "gemini-3.1-flash-lite" };
        return await ai.models.generateContent(fallbackParams);
      } catch (fallbackErr: any) {
        console.warn("[A&R Guard] Primary and standby Gemini engines deferred. Routing to offline engine.");
        throw fallbackErr;
      }
    }
    throw err;
  }
}

async function triggerGhostCutEngineAsyncTask(params: {
  url: string;
  rect_array?: any[];
  mode?: string;
  use_inpainting?: boolean;
}) {
  const { url, rect_array, mode, use_inpainting } = params;
  console.log(`[GhostCut Background Engine] Triggering task for video: ${url}`);

  const apiKey = process.env.GHOSTCUT_API_KEY || process.env.WATERMARK_ERASER_API_KEY;
  if (!apiKey) {
    console.warn("[GhostCut Background Engine] No GHOSTCUT_API_KEY or WATERMARK_ERASER_API_KEY configured in environment variables. Running in simulated offline mode.");
    setTimeout(() => {
      console.log(`[GhostCut Background Engine] (Simulated) Task for ${url} completed successfully after background synthesis!`);
    }, 15000);
    return;
  }

  const provider = process.env.GHOSTCUT_PROVIDER || "rapidapi";
  let targetUrl = "";
  const headers: Record<string, string> = {};

  if (provider === "rapidapi") {
    // Auto-register user first on RapidAPI
    const customId = "user_" + apiKey.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
    try {
      console.log(`[GhostCut Background Engine] Pre-registering RapidAPI user with customIdentity: ${customId}`);
      await fetch("https://auto-video-watermark-or-subtitles-remove.p.rapidapi.com/user/create", {
        method: "POST",
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "auto-video-watermark-or-subtitles-remove.p.rapidapi.com",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          customIdentity: customId,
          mail: "",
          phone: ""
        })
      });
    } catch (e) {
      console.warn("[GhostCut Background Engine] Pre-registration failed (non-blocking):", e);
    }

    targetUrl = "https://auto-video-watermark-or-subtitles-remove.p.rapidapi.com/api/pub/video/create";
    headers["X-RapidAPI-Key"] = apiKey;
    headers["X-RapidAPI-Host"] = "auto-video-watermark-or-subtitles-remove.p.rapidapi.com";
  } else {
    targetUrl = "https://api-en.jollytoday.com/api/pub/video/create";
    headers["Authorization"] = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
  }

  const requestBody: Record<string, any> = {
    video_url: url,
    mode: mode || "remove_watermark",
    watermark_type: 1
  };

  if (provider === "rapidapi") {
    requestBody.customIdentity = "user_" + apiKey.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
  }

  if (typeof use_inpainting !== 'undefined') {
    requestBody.inpainting = use_inpainting ? 1 : 0;
  }

  if (rect_array && Array.isArray(rect_array) && rect_array.length > 0) {
    requestBody.regions = rect_array;
    requestBody.rect_array = rect_array;
    requestBody.watermark_type = 2;
  }

  try {
    const jsonHeaders = {
      ...headers,
      "Content-Type": "application/json"
    };

    console.log(`[GhostCut Background Engine] Contacting GhostCut API at ${targetUrl}...`);
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();
    console.log("[GhostCut Background Engine] GhostCut API responded with status:", response.status, responseData);
  } catch (err: any) {
    console.error("[GhostCut Background Engine] Error during async task trigger:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 200 * 1024 * 1024, // 200MB limits for videos
    },
  });

  // Let Express trust proxy headers (X-Forwarded-Proto, X-Forwarded-Host) for Cloud Run, Render, etc.
  app.set("trust proxy", true);

  // Middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API - Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API - Simple CORS Proxy for audio files
  app.get("/api/proxy-audio", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== "string") {
      res.status(400).send("URL parameter is required");
      return;
    }

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        res.status(response.status).send(`Failed to fetch: ${response.statusText}`);
        return;
      }

      res.setHeader("Content-Type", response.headers.get("content-type") || "audio/mpeg");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");
      
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error("CORS Proxy error:", err);
      res.status(500).send(`CORS proxy failed: ${err.message || err}`);
    }
  });

  // API - Simple CORS Proxy for video files
  app.get("/api/proxy-video", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== "string") {
      res.status(400).send("URL parameter is required");
      return;
    }

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        res.status(response.status).send(`Failed to fetch: ${response.statusText}`);
        return;
      }

      res.setHeader("Content-Type", response.headers.get("content-type") || "video/mp4");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");
      
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      console.error("Video CORS Proxy error:", err);
      res.status(500).send(`CORS proxy failed: ${err.message || err}`);
    }
  });

  const runGeminiAnalysis = async (filename: string, duration: number) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined" || !apiKey.trim()) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-server',
        }
      }
    });

    const durationText = duration ? `The measured duration is ${Math.round(duration)} seconds.` : '';
    const prompt = `Analyze the audio track filename "${filename}" as an elite music producer and A&R expert. ${durationText}
Deduce its details:
1. BPM speed (e.g., check for number patterns like "140BPM" or guess standard tempo based on genre hints).
2. Musical key signature (standard format, e.g., "A minor", "F# major").
3. Camelot DJ mixing key notation (e.g. "8A" for A minor, "11B" for A major).
4. Specific genre classification (e.g. "Ambient Synthwave", "Dark Trap", "Hard Chicago Drill", "Soulful Acoustic").
5. Artistic mood description (e.g. "Melancholic & Reflective", "Euphoric & High Energy", "Gritty & Intense").
6. Sonic textures/vibes (e.g. "Analog Warmth & Vinyl Crackle", "Sub-Bass Heavy & Aggressive Drums").
7. Primary instruments detected or inferred (e.g. "Acoustic Felt Piano, Rhodes", "Subdued Acoustic Guitar").
8. A label-ready, single-sentence marketing pitch describing the track's target audience and emotion.
9. Whether it's an instrumental track (true of most beat tapes/backing tracks) or containing prominent vocals.
10. Stylistic tags and high-value search discovery SEO keywords.`;
    
    const aiResponse = await generateContentWithFallback(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an automated professional music transcription, metadata tagging and mastering intelligence agent.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bpm: { type: Type.INTEGER, description: "BPM speed of the track, between 60 and 200" },
            key: { type: Type.STRING, description: "Key signature of the track, e.g. C Major, F# Minor, etc." },
            camelot_key: { type: Type.STRING, description: "Camelot mix key, e.g. 8A, 11B, etc." },
            genre_category: { type: Type.STRING, description: "Micro-genre, e.g. Phonk, Ambient Lofi, Dark Trap" },
            mood: { type: Type.STRING, description: "One dominant emotional mood description" },
            vibe: { type: Type.STRING, description: "High-fidelity texture or sound vibe, e.g. Warm Analog Saturation" },
            primary_instruments: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of 2 to 4 key instruments, e.g. '808 Bass', 'Rhodes Piano'"
            },
            pitch: { type: Type.STRING, description: "Label-ready 1-sentence marketing/curator pitch" },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Up to 4 quick stylistic tags, e.g. Trap, Clean, Dark"
            },
            instrumental: { type: Type.BOOLEAN, description: "True if the track is likely instrumental, false if vocal-heavy" },
            seo_keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 to 4 SEO phrases for search discoverability"
            }
          },
          required: [
            "bpm", 
            "key", 
            "camelot_key", 
            "genre_category", 
            "mood", 
            "vibe", 
            "primary_instruments", 
            "pitch", 
            "tags", 
            "instrumental", 
            "seo_keywords"
          ]
        }
      }
    });

    const text = aiResponse.text;
    if (!text) {
      throw new Error("No response text from Gemini API");
    }

    const data = JSON.parse(text.trim());
    return {
      bpm: data.bpm,
      key: data.key,
      camelot_key: data.camelot_key || "",
      genre_category: data.genre_category || "",
      mood: data.mood || "",
      vibe: data.vibe || "",
      primary_instruments: data.primary_instruments || [],
      pitch: data.pitch || "",
      tags: data.tags || [],
      instrumental: data.instrumental ?? true,
      seo_keywords: data.seo_keywords ?? []
    };
  };

  // API - Analyze Track
  app.post("/api/analyze", async (req, res) => {
    const { filename, duration } = req.body;
    if (!filename || typeof filename !== "string") {
      res.status(400).json({ error: "Filename is required" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined" || !apiKey.trim()) {
      console.warn("Gemini API key is not configured on the server. Performing offline heuristic analysis.");
      const data = getMockTrackAnalysis(filename, duration);
      res.json({
        ...data,
        isFallback: true,
        fallbackReason: "API key is not configured."
      });
      return;
    }

    try {
      const data = await runGeminiAnalysis(filename, duration);
      res.json(data);
    } catch (err: any) {
      console.warn("[A&R Guard] Dynamic track analysis unavailable. Utilizing offline heuristic mapping.");
      const data = getMockTrackAnalysis(filename, duration);
      res.json({
        ...data,
        isFallback: true,
        fallbackReason: err?.message || "Rate limit or connection timeout."
      });
    }
  });

  // API - Generate Aesthetic
  app.post("/api/generate-aesthetic", async (req, res) => {
    const { trackInfo } = req.body;
    if (!trackInfo) {
      res.status(400).json({ error: "trackInfo is required" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined" || !apiKey.trim()) {
      console.warn("Gemini API key is not configured on the server. Performing offline aesthetic generation.");
      const data = getMockAesthetic(trackInfo);
      res.json({
        ...data,
        isFallback: true,
        fallbackReason: "API key is not configured."
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build-server',
          }
        }
      });

      const prompt = `Analyze the audio metadata for this reference track:
Name: ${trackInfo.name || "Untitled"}
Artist: ${trackInfo.artist || "Unknown"}
BPM: ${trackInfo.bpm || 120}
Key: ${trackInfo.key_signature || "C Major"}
Duration: ${trackInfo.duration || 180}s
Tags: ${JSON.stringify(trackInfo.tags || [])}

Based on this, generate:
1. imagePrompt: A detailed, ready-to-use prompt for an image generator (like Imagen 3 or Midjourney) describing a visual background loop asset. It must fit our 'Industrial Cyber-Chrome & Neon Orange' style. Include material textures (brushed metal, polished chrome, glowing fiber optics), studio gear (modular synths, tape recorders, reels), and colors (charcoal black, vibrant neon safety orange, steel blue accents).
2. suggestedStyle: A short style name summarizing this track's vibe.
3. motionDescription: A brief instruction card directing real-time graphic engine camera shifts, pan movements, or element animations.`;

      const aiResponse = await generateContentWithFallback(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an visual creative director and music visualizer director. You specialize in synthwave, cyberpunk, lo-fi, trap, and industrial audio visuals. Always respond with valid JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              imagePrompt: {
                type: Type.STRING,
                description: "High-end 8k image generator prompt fitting cyber-chrome neon orange theme."
              },
              suggestedStyle: {
                type: Type.STRING,
                description: "Compact visual style category."
              },
              motionDescription: {
                type: Type.STRING,
                description: "Directives for background camera rendering adjustments."
              }
            },
            required: ["imagePrompt", "suggestedStyle", "motionDescription"]
          }
        }
      });

      const text = aiResponse.text;
      if (text) {
        try {
          res.json(JSON.parse(text.trim()));
          return;
        } catch (jsonErr) {
          console.warn("[A&R Guard] Aesthetic JSON structural check failed. Recalibrating locally.");
        }
      }
      res.status(502).json({ error: "Invalid response pattern from AI assistant" });
    } catch (err: any) {
      console.warn("[A&R Guard] Aesthetic visual director unavailable. Activating local theme director.");
      const data = getMockAesthetic(trackInfo);
      res.json({
        ...data,
        isFallback: true,
        fallbackReason: err?.message || "Rate limit or connection timeout."
      });
    }
  });

  // Helper to perform offline high-fidelity heuristic tracking analysis when Gemini is unreachable or rate-limited
  const getMockTrackAnalysis = (filename: string, durationEstimate: number) => {
    const cleanLower = filename.toLowerCase();
    
    const isThirsty = cleanLower.includes("keep em' thirsty") ||
      cleanLower.includes("keep em thirsty") ||
      cleanLower.includes("keep_em_thirsty") ||
      (cleanLower.includes("keep") && cleanLower.includes("thirsty"));

    let bpm = 120;
    const bpmMatch = cleanLower.match(/(\d{2,3})\s*(?:bpm|BPM)/);
    if (bpmMatch) {
      bpm = parseInt(bpmMatch[1], 10);
    } else {
      const numbers = cleanLower.match(/\b\d{2,3}\b/g);
      if (numbers) {
        for (const numStr of numbers) {
          const num = parseInt(numStr, 10);
          if (num >= 60 && num <= 200) {
            bpm = num;
            break;
          }
        }
      }
    }

    let key = "C Major";
    let camelot_key = "8B";
    if (isThirsty) {
      key = "E minor";
      camelot_key = "9A";
    } else if (cleanLower.includes("drift") || cleanLower.includes("tokyo")) {
      key = "F# major";
      camelot_key = "2B";
    }

    let genre_category = "Modern Trap";
    let mood = "Determined & Energetic";
    let vibe = "Analog Saturation";
    let tags = ["Trap", "Heavy", "Dark"];
    let primary_instruments = ["Sub-Bass", "Snare Rolls", "Synthesizer"];
    let pitch = "A powerful cinematic release driven by heavy rhythms.";
    let seo_keywords = ["hype release 2026", "indie artist track", "modern production master"];
    let instrumental = false;

    if (isThirsty) {
      genre_category = "Gritty Rap / Trap / Neo-Noir";
      mood = "Menacing, Authoritative & Confident";
      vibe = "Deep Obsidian Blacks, Stark Metallic Silver, Intense Amber Accents";
      tags = ["Rap", "Trap", "Gritty", "Neo-Noir", "Active"];
      primary_instruments = ["Heavy 808 Bass", "Lighter Ignitions", "Obsidian Throne Atmosphere", "Sharp Hi-Hats"];
      pitch = "The absolute, high-fashion street-rap masterpiece. Deep vinyl crackle fits the atmospheric dark space perfectly.";
      seo_keywords = ["keep em thirsty rap", "og beatz street anthem", "gritty noir trap song", "high fashion rap single 2026"];
      instrumental = false;
    } else if (cleanLower.includes("drift") || cleanLower.includes("tokyo")) {
      genre_category = "Phonk / Drift / Synthwave";
      mood = "High-velocity & Atmospheric";
      vibe = "Neon Holographic, Midnight Rain Reflection";
      tags = ["Phonk", "Drift", "Synthwave", "Cyberpunk"];
      primary_instruments = ["Screeching Tires Sample", "Cowbell Hits", "Heavy Analog Synth Bass"];
      pitch = "Unleash adrenaline with this high-octane cyberpunk racing anthem.";
      seo_keywords = ["tokyo drift phonk", "midnight drag race synth", "cyberpunk phonk 2026"];
      instrumental = true;
    } else if (cleanLower.includes("coffee") || cleanLower.includes("midnight") || cleanLower.includes("lofi") || cleanLower.includes("lo-fi") || cleanLower.includes("chill")) {
      genre_category = "Ambient Lofi / Cozy Chillout";
      mood = "Nostalgic & Cozy";
      vibe = "Late-Night Rain, Cozy Cafe vinyl warmth";
      tags = ["Lofi", "Chill", "Ambient", "Smooth"];
      primary_instruments = ["Lush Rhodes Keys", "Vinyl Pop & Crackle Loops", "Soft Rain Atmosphere", "Warm Electric Guitar Chords"];
      pitch = "Sit back, pour a coffee, and sink into deep nostalgic, late-night relaxing lofi vibes.";
      seo_keywords = ["lofi chill single", "relaxing study song", "cozy cafe background music"];
      instrumental = true;
    }

    return {
      bpm,
      key,
      camelot_key,
      genre_category,
      mood,
      vibe,
      primary_instruments,
      pitch,
      tags,
      instrumental,
      seo_keywords
    };
  };

  // Helper to perform offline high-fidelity aesthetic loop direction when Gemini is offline/rate-limited
  const getMockAesthetic = (trackInfo: any) => {
    const name = trackInfo?.name || "Untitled";
    const artist = trackInfo?.artist || "OG BEATZ";
    const tags = Array.isArray(trackInfo?.tags) ? trackInfo.tags.map((t: string) => t.toLowerCase()) : [];
    
    let imagePrompt = `Ultra-detailed 8k high-fidelity render, Industrial Cyber-Chrome & Neon Orange aesthetic. A vintage reel-to-reel tape machine in a dark obsidian-clad music studio, pulsing with glowing neon orange fiber optic lines and cybernetic silver metallic gears inside. Ambient smoke and cinematic backlighting.`;
    let suggestedStyle = "Industrial Cyber-Chrome";
    let motionDescription = "Camera executes a slow, hypnotic forward push-in toward the spinning reel tape heads, synced to a warm pulsing visual beat of sub-harmonics.";

    const hasTag = (words: string[]) => words.some(w => tags.includes(w) || name.toLowerCase().includes(w));

    if (hasTag(["lofi", "lo-fi", "chill", "relax", "study", "ambient", "smooth"])) {
      imagePrompt = `Muted lo-fi animation style, warm cozy cafe at midnight. Rain droplets beating softly on the glass, a steaming porcelain coffee cup sitting next to a glowing retro analog typewriter and vinyl record player. Colors of deep dusty-violet, warm amber, and charcoal.`;
      suggestedStyle = "Muted Late-Night Lofi";
      motionDescription = "Soft horizontal camera panning with subtle organic film dust layers and slow-moving rain streaks behind glass.";
    } else if (hasTag(["drift", "tokyo", "cyberpunk", "synthwave"])) {
      imagePrompt = `Premium cyberpunk retro-futuristic city skyline. Rain-slicked asphalt reflecting towering holographic neon street advertisements in dark blues, magenta, and high-contrast amber. A classic matte-black retro coupe sits with lit taillights.`;
      suggestedStyle = "Cyberpunk Retro-Drive";
      motionDescription = "Streaking neon taillight glows with rapid camera pans mimicking a sense of infinite, dark highway driving.";
    } else if (hasTag(["drill", "grime", "uk", "industrial", "gritty", "aggressive"])) {
      imagePrompt = `High-contrast gritty underground warehouse vault. Heavy concrete pillars, harsh cold metallic silver panels, flickering tungsten security cages. An empty obsidian display frame sits under a vertical overhead beam of spotlight.`;
      suggestedStyle = "Gritty Sub-Concrete";
      motionDescription = "Aggressive visual strobe flicker synced with bass pulses, alternating sharp angle match-cuts.";
    } else if (hasTag(["acoustic", "melodic", "guitar", "organic"])) {
      imagePrompt = `Atmospheric organic outdoor forest clearing at sunset. Light shafts filtering down from mountain pines, catching floating golden dust motes around an ancient wooden acoustic guitar leaning on a monolithic dark stone. Warm gold and forest green colors.`;
      suggestedStyle = "Intimate Organic Sunset";
      motionDescription = "Gentle floating crane shift upwards, following the warm shafts of light with a slow-motion focal depth blur.";
    }

    return { imagePrompt, suggestedStyle, motionDescription };
  };

  // Helper function for high-fidelity genre-specific mock promo packs
  const getMockPromoPack = (trackInfo: any) => {
    const name = trackInfo?.name || "Untitled Track";
    const artist = trackInfo?.artist || "Unknown Artist";
    const bpm = trackInfo?.bpm || 120;
    const key = trackInfo?.key_signature || "C Major";
    const tags: string[] = Array.isArray(trackInfo?.tags) ? trackInfo.tags : [];
    const tagsLower = tags.map(t => t.toLowerCase());

    const hasTag = (words: string[]) => words.some(w => tagsLower.includes(w) || name.toLowerCase().includes(w));
    
    // Leverage pre-computed physical attributes if available to customize instruments & mood
    const ar = trackInfo?.acousticReport;
    const customBass = ar?.bassDensity === 'High' ? "Heavy sub-bass register presence" : (ar?.bassDensity === 'Subtle' ? "Warm ambient bass backing" : "Balanced melodic low-end");
    const customMids = ar?.midPresence === 'Dominant' ? "Lush acoustic chords and primary vocals" : "Melodic synthesizer leads and warm vocals";
    const customHighs = ar?.highAirRange === 'Crisp' ? "Sharp transient hi-hat rolls and ambient sparkle" : "Soft vintage tape sizzle and air frequency warmth";
    const customInstruments = ar ? [customBass, customMids, customHighs, "Organic auxiliary percussion"] : null;

    if (hasTag(["lofi", "lo-fi", "chill", "relax", "study", "ambient", "smooth"])) {
      return {
        youtube: {
          title: `☕ "${name}" - ${artist} [Official Audio] (Chill Lofi / Bedroom Soul)`,
          description: `Stream/Download "${name}" by ${artist}: [Streaming Link]\n\nGrab a warm coffee and relax. A heartfelt, nostalgic song escape titled "${name}".\n\nProduced with organic texture layers, vinyl dust saturation, primary vocals, and warm chord movements, perfect for late-night driving, studying, or bedroom relaxation.\n\nTEMPO: ${bpm} BPM\nKEY: ${key}\n\nOut now on Spotify, Apple Music, and all platforms. For playlist placement inquiries, reach out via the artist portal.`
        },
        instagram: `☕ Sat down and let the dust settle. "${name}" is officially out everywhere today. Warm vintage Keys, crackling vinyl breaks, and analog tape warmth backing an intimate performance.\n\ntempo: ${bpm} bpm | key: ${key}\n\nStream "${name}" now via the link in my profile! Let me know your favorite part.`,
        generic: `Hi there, hope you're doing great! Just wanted to share my new cozy, nostalgic single release titled "${name}". It has a very heartfelt, relaxed vibe with warm vintage keys and mellow vocals. I think it would be a perfect fit for your lofi / bedroom playlists. Let me know if you would like me to send over structural files or schedule an interview! Cheers.`,
        analysis: {
          instrument_status: "Vocal Release / Song",
          seo_keywords: ["lofi chill single", "chill study song", "relaxing vocal lofi", `${artist.toLowerCase()} lofi`, "cozy bedroom single"],
          beatstars_tags: ["lofi", "chill", "vocal"],
          youtube_tags: ["lofi vocal song", "relaxing bedroom music", "lofi study single", "lofi song for streaming", "cozy background lofi"],
          mood_tags: ["Cozy", "Chill", "Nostalgic"],
          mood: "Warm & Nostalgic",
          energy: ar?.dynamicRangeDb && ar.dynamicRangeDb > 14 ? "Very Dynamic Low Flow" : "Low Flow",
          target_audience: "Lofi Playlists, Chillout Curator Inboxes, Late-night vloggers",
          instruments: customInstruments || ["Spitfire felt piano", "Warm Rhodes keys", "Intimate vocals", "Dusty vinyl crackle"]
        }
      };
    }

    if (hasTag(["drill", "grime", "uk", "industrial", "gritty", "aggressive"])) {
      return {
        youtube: {
          title: `💀 ${artist} - "${name}" [Official Visualizer] (UK/NY Drill Active Release)`,
          description: `Step into pure industrial grit. Presenting the relentless single "${name}" by ${artist}.\n\nFeaturing raw vocal velocities, dark orchestral string patterns, rapid triplet hi-hat runs, and heavy sliding 808 register flows. Built for peak sound system impact.\n\nTEMPO: ${bpm} BPM\nKEY: ${key}\n\nStream Link: [Streaming Link]\nDM for Bookings: [Booking Email]\nCopyright owned by the artist.`
        },
        instagram: `💀 RAW VOLTAGE: "${name}" is finally active on all platforms. Sliding sub-bass glides, rapid hi-hat rolling patterns, and dark string suspense backing a heavyweight flows.\n\ntempo: ${bpm} bpm | key: ${key}\n\nStream it, play it loud, add it to your rotation. Official visualizer out now, link in bio!`,
        generic: `Yo! Just released a heavy new Drill record titled "${name}" and wanted to put it on your radar for playlist considerations or blog roundups. It's got sliding sub glides and very aggressive momentum that gets immediate reaction. Appreciate you tuning in!`,
        analysis: {
          instrument_status: "Vocal Release / Song",
          seo_keywords: ["drill release 2026", "uk drill artist", "ny drill track", "sliding bass vocal rap", "hard drill single"],
          beatstars_tags: ["drill", "gritty", "uk-drill"],
          youtube_tags: ["uk drill rap song", "ny drill official audio", "hard street rap single", "heavy sliding bass track", "dark drill release"],
          mood_tags: ["Aggressive", "Gritty", "Dark"],
          mood: "Aggressive & Gritty",
          energy: "High Flow",
          target_audience: "Drill Rap Playlists, Urban music blogs, High-energy workout channels",
          instruments: customInstruments || ["Sliding 808 glides", "Haunting violins", "Rapid copper hats", "Heavyweight lead vocals"]
        }
      };
    }

    if (hasTag(["acoustic", "melodic", "guitar", "organic", "folk", "guitarra"])) {
      return {
        youtube: {
          title: `🎸 "${name}" - ${artist} (Official Acoustic Session / Song)`,
          description: `A deeply organic, emotional canvas for storytelling. Presenting an intimate acoustic-led single titled "${name}" by ${artist}.\n\nFeatures warm acoustic fingerpicking, authentic vocal lines, and melancholic ambient strings to provide deep emotional space for lyrics.\n\nTEMPO: ${bpm} BPM\nKEY: ${key}\n\nStream on Spotify & Apple Music: [Streaming Link]\nSubscribe to stay updated with monthly acoustic sessions.`
        },
        instagram: `🎸 Intimate guitar chords and raw storytelling. This is "${name}", featuring handcrafted guitar melodies, warm organic percussion, and highly personal lyric sheets.\n\ntempo: ${bpm} bpm | key: ${key}\n\nStream "${name}" now via the link in my profile! It would mean the world if you shared it.`,
        generic: `Hi! I wanted to pitch my beautiful, guitar-driven single titled "${name}". It has live acoustic vibes blended with deep modern bass, creating a highly emotional atmosphere for songwriting and relatable vocals. I would love to hear your thoughts for playlist support or blog coverage. Cheers!`,
        analysis: {
          instrument_status: "Vocal Release / Song",
          seo_keywords: ["acoustic guitar song", "emotional singer songwriter", "melodic indie pop track", `${artist.toLowerCase()} acoustic`, "organic storytelling song"],
          beatstars_tags: ["acoustic", "guitar", "melodic"],
          youtube_tags: ["acoustic indie song", "guitar rap vocal", "emotional acoustic single", "melodic folk pop audio", "sad story song 2026"],
          mood_tags: ["Intimate", "Emotional", "Heartfelt"],
          mood: "Intimate & Heartfelt",
          energy: "Medium Flow",
          target_audience: "Acoustic indie fans, Spotify editorial playlists, Melodic rap/pop curators",
          instruments: customInstruments || ["Chamber acoustic guitar", "Soft acoustic bass", "Heartfealt vocals", "Melancholic cellos"]
        }
      };
    }

    // Default Trap variant
    return {
      youtube: {
        title: `🔥 ${artist} - "${name}" [Official Music Video / Audio]`,
        description: `The official release of "${name}" by ${artist}. Out now on all digital streaming networks.\n\nEquipped with heavyweight sub-bass registers, crisp double-time hats, atmospheric synthesizer textures, and hard-hitting vocal layouts.\n\nTEMPO: ${bpm} BPM\nKEY: ${key}\n\nStream Link: [Streaming Link]\nFor features and booking contact: [Booking Email]`
      },
      instagram: `🔥 THE SINGLE OUT NOW: "${name}" is officially live everywhere. Heavyweight sub-bass, rapid-fire hi-hat velocities, dark atmospheric layers, and uncut vocal performance.\n\ntempo: ${bpm} bpm | key: ${key}\n\nStream it, play it loud, add it to your playlists! Link in my profile! 🔗`,
      generic: `Hey! I just dropped a massive new trap-influenced single titled "${name}". This one has heavy sliding 808 sub bass, energetic dark synth leads, and powerful lyrical delivery. It would fit perfectly on your playlist for new high-energy hip-hop releases. Let me know what you think! Thanks.`,
      analysis: {
        instrument_status: "Vocal Release / Song",
        seo_keywords: ["trap single release", "dark active rap song", "808 heavy vocals", `${artist.toLowerCase()} trap`, "cinematic urban track"],
        beatstars_tags: ["trap", "hiphop", "vocal"],
        youtube_tags: ["trap hip hop song", "hard active rap audio", "heavy 808 track", "dark trap release 2026", "rap song with lead vocals"],
        mood_tags: ["Dark", "Cinematic", "Energetic"],
        mood: "Dark & Cinematic",
        energy: "High Flow",
        target_audience: "Modern hip-hop stream playlists, Urban radio, Gaming channels",
        instruments: customInstruments || ["Roland TR-808 sub", "Crisp double-time hats", "Space-age analog synthesizers", "Lyrical vocals"]
      }
    };
  };

  // Vite middleware for development vs static asset serving for production
  const distPath = path.join(process.cwd(), "dist");
  const isProductionMode = process.env.NODE_ENV === "production" || 
                           process.env.RENDER === "true" || 
                           fs.existsSync(distPath);

  if (!isProductionMode) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server starting error:", err);
});
