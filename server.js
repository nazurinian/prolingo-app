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

app.listen(port, () => {
    console.log(`Backend TTS Streaming running at http://localhost:${port}`);
});
