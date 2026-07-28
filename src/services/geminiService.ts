import { GoogleGenAI, Type } from "@google/genai";

let ai: GoogleGenAI | null = null;
let geminiApiKey = "";
try {
  geminiApiKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY as string) || "";
} catch (e) {}

if (!geminiApiKey && typeof process !== 'undefined' && process.env) {
  try {
    geminiApiKey = process.env.GEMINI_API_KEY || "";
  } catch (err) {}
}

if (geminiApiKey && geminiApiKey !== "undefined" && geminiApiKey.trim()) {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } catch (err) {
    console.warn("Failed to initialize GoogleGenAI client:", err);
  }
}

export async function generateVideoAesthetic(trackInfo: any) {
  try {
    const response = await fetch("/api/generate-aesthetic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackInfo }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.warn("Server-side Gemini aesthetic generation failed, utilizing offline fallback:", err);
    return { 
      imagePrompt: `Professional record studio console close-up, steel metallic details, glowing safety orange audio meters, bokeh backlights. Vibe of ${trackInfo?.name || "Reference track"}.`,
      suggestedStyle: "Neon Chrome",
      motionDescription: "Slow tracking pan along the mixer console faders with audio reactive glow."
    };
  }
}

export async function generatePromoPack(trackInfo: any) {
  const getMockPromoPack = (info: any) => {
    const name = info?.name || "Untitled Track";
    const artist = info?.artist || "Unknown Artist";
    const bpm = info?.bpm || 120;
    const key = info?.key_signature || "C Major";
    const tags: string[] = Array.isArray(info?.tags) ? info.tags : [];
    const tagsLower = tags.map(t => t.toLowerCase());

    const hasTag = (words: string[]) => words.some(w => tagsLower.includes(w) || name.toLowerCase().includes(w));

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
          energy: "Low Flow",
          target_audience: "Lofi Playlists, Chillout Curator Inboxes, Late-night vloggers",
          instruments: ["Spitfire felt piano", "Warm Rhodes keys", "Intimate vocals", "Dusty vinyl crackle"]
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
          instruments: ["Sliding 808 glides", "Haunting violins", "Rapid copper hats", "Heavyweight lead vocals"]
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
          instruments: ["Chamber acoustic guitar", "Soft acoustic bass", "Heartfealt vocals", "Melancholic cellos"]
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
        instruments: ["Roland TR-808 sub", "Crisp double-time hats", "Space-age analog synthesizers", "Lyrical vocals"]
      }
    };
  };

  try {
    const response = await fetch("/api/generate-promo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackInfo }),
    });

    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    console.warn("Server-side Gemini promo generation failed, utilizing offline fallback:", err);
    return getMockPromoPack(trackInfo);
  }
}
