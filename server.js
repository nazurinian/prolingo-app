import express from 'express';
import cors from 'cors';
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

app.post("/api/tts", async (req, res) => {
    try {
        const { text, voice, rate, pitch } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Text is required" });
        }

        const selectedVoice = voice || "en-US-AriaNeural";
        const selectedRate = rate || "0%";
        const selectedPitch = pitch || "0Hz";

        console.log(`[TTS STREAM] Voice: ${selectedVoice}, Text: ${text.substring(0, 25)}...`);

        // --------- INIT TTS ---------
        const tts = new MsEdgeTTS();
        await tts.setMetadata(
            selectedVoice,
            OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
        );

        // --------- CREATE STREAM ---------
        const { audioStream } = tts.toStream(text, {
            rate: selectedRate,
            pitch: selectedPitch,
        });

        // Header streaming
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Transfer-Encoding", "chunked");

        // --------- PIPE STREAM KE RESPONSE ---------
        audioStream.on("data", (chunk) => {
            res.write(chunk);
        });

        audioStream.on("end", () => {
            res.end();
            console.log("[TTS] Stream finished");
        });

        audioStream.on("error", (err) => {
            console.error("Stream error:", err);
            res.status(500).end("Stream Error");
        });

    } catch (error) {
        console.error("Edge TTS Error:", error);
        res.status(500).json({ error: "Failed to generate audio", details: error.message });
    }
});

app.get("/", (req, res) => {
    res.send(`
        <html>
            <head><title>ProLingo TTS Backend</title></head>
            <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
                <div style="text-align: center; padding: 2rem; background: #1e293b; border-radius: 1rem; border: 1px solid #334155; max-width: 480px;">
                    <h2 style="color: #6366f1; margin-top: 0;">⚡ ProLingo TTS Backend Online</h2>
                    <p style="color: #94a3b8; font-size: 14px;">Ini adalah server API Backend (Port 3001).</p>
                    <div style="margin: 1.5rem 0; padding: 1rem; background: #0f172a; border-radius: 0.5rem; text-align: left; font-size: 13px;">
                        <p style="margin: 0 0 0.5rem 0; color: #38bdf8;">👉 <b>Untuk membuka Aplikasi ProLingo:</b></p>
                        <p style="margin: 0; color: #cbd5e1;">Buka Frontend di <b>Port 5173</b>:</p>
                        <ul style="margin: 0.5rem 0 0 1.2rem; padding: 0; color: #a5f3fc;">
                            <li>Lokal: <a href="http://localhost:5173" style="color: #818cf8;">http://localhost:5173</a></li>
                            <li>Mobile / Tailscale: <code>http://[IP-Laptop]:5173</code></li>
                        </ul>
                    </div>
                    <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">Status API: <span style="color: #4ade80;">Running OK</span></p>
                </div>
            </body>
        </html>
    `);
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Edge TTS Backend", timestamp: new Date().toISOString() });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Backend TTS Streaming running on port ${port} (0.0.0.0)`);
    console.log(`- Local: http://localhost:${port}`);
    console.log(`- Network / Tailscale: http://<your-ip>:${port}`);
});
