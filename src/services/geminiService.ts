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

