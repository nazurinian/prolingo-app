import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/* Ini adalah format Serverless Function Vercel.
   Tidak perlu 'express', 'app.listen', atau 'port'.
   Cukup export default function handler(req, res).
*/

export default async function handler(req, res) {
    // 1. Setup CORS Manual (Penting agar frontend bisa akses)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Ganti '*' dengan domain asli saat production untuk keamanan lebih
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle Preflight Request (Browser cek izin dulu sebelum POST)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Pastikan Method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    try {
        // Parsing body di Vercel otomatis jika Content-Type application/json
        const { text, voice, rate, pitch } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Text is required" });
        }

        const selectedVoice = voice || "en-US-AriaNeural";
        const selectedRate = rate || "0%";
        const selectedPitch = pitch || "0Hz";

        console.log(`[Vercel TTS] Voice: ${selectedVoice}, Text: ${text.substring(0, 20)}...`);

        // 2. Init TTS
        const tts = new MsEdgeTTS();
        await tts.setMetadata(
            selectedVoice,
            OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
        );

        // 3. Create Stream
        // Kita gunakan teknik yang sama dengan server.js yang sukses tadi
        const { audioStream } = tts.toStream(text, {
            rate: selectedRate,
            pitch: selectedPitch,
        });

        // 4. Set Headers Response
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Transfer-Encoding", "chunked");

        // 5. Streaming Data ke Response
        // Kita bungkus dalam Promise agar Vercel Function tidak "mati" sebelum stream selesai
        await new Promise((resolve, reject) => {
            audioStream.on("data", (chunk) => {
                res.write(chunk);
            });

            audioStream.on("end", () => {
                res.end();
                console.log("[Vercel TTS] Stream finished");
                resolve();
            });

            audioStream.on("error", (err) => {
                console.error("Stream error:", err);
                if (!res.headersSent) res.status(500).end("Stream Error");
                reject(err);
            });
        });

    } catch (error) {
        console.error("Vercel Function Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to generate audio", details: error.message });
        }
    }
}