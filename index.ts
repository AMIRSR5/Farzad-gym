// Supabase Edge Function: tts
// Proxies text-to-speech requests to Azure Cognitive Services Speech
// (fa-IR neural voices: fa-IR-FaridNeural, fa-IR-DilaraNeural) and
// returns raw MP3 audio. Keeps the Azure key secret, off the frontend.
//
// Deploy:
//   supabase functions deploy tts --no-verify-jwt
//   supabase secrets set AZURE_SPEECH_KEY=xxxxx AZURE_SPEECH_REGION=westeurope
//
// If you deploy WITHOUT --no-verify-jwt, the frontend must send the
// Supabase anon key as a Bearer token (the app's settings box supports this).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text, voice, rate, pitch } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "متن ارسال نشده است." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AZURE_KEY = Deno.env.get("AZURE_SPEECH_KEY");
    const AZURE_REGION = Deno.env.get("AZURE_SPEECH_REGION");
    if (!AZURE_KEY || !AZURE_REGION) {
      return new Response(
        JSON.stringify({ error: "AZURE_SPEECH_KEY یا AZURE_SPEECH_REGION تنظیم نشده است." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const voiceName = voice || "fa-IR-FaridNeural";
    const ratePct = Number.isFinite(rate) ? rate : 0;   // -40..40
    const pitchPct = Number.isFinite(pitch) ? pitch : 0; // -30..30

    const ssml = `
<speak version="1.0" xml:lang="fa-IR">
  <voice name="${voiceName}">
    <prosody rate="${ratePct}%" pitch="${pitchPct}%">
      ${text}
    </prosody>
  </voice>
</speak>`.trim();

    const azureRes = await fetch(
      `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": AZURE_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "persian-tts-app",
        },
        body: ssml,
      }
    );

    if (!azureRes.ok) {
      const detail = await azureRes.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Azure TTS error ${azureRes.status}`, detail }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await azureRes.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
