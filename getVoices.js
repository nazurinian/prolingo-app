// get-voices.mjs
import { MsEdgeTTS } from "msedge-tts";
import fs from "fs";

async function main() {
  const tts = new MsEdgeTTS();

  // 1. Ambil semua voices dari MsEdgeTTS
  const voices = await tts.getVoices();
  console.log("Total voices:", voices.length);

  // 2. Filter khusus bahasa Inggris (semua en-*)
  const englishVoices = voices.filter(v => v.Locale.startsWith("en"));
  const indonesiaVoices = voices.filter(v => ["id-ID", "jv-ID", "su-ID"].includes(v.Locale));

  console.log("English voices:", englishVoices.length);
  console.log("Contoh 10 pertama:\n");

  englishVoices.slice(0, 10).forEach(v => {
    console.log(`${v.ShortName} (${v.Gender}) – ${v.Locale} – ${v.FriendlyName}`);
  });

  console.log("Indonesia voices:", indonesiaVoices.length);
  console.log("Contoh 10 pertama:\n");

  indonesiaVoices.slice(0, 10).forEach(v => {
    console.log(`${v.ShortName} (${v.Gender}) – ${v.Locale} – ${v.FriendlyName}`);
  });

  // 3. Simpan ke file biar enak dianalisa
  fs.writeFileSync(
    "./public/english_voices_from_msedge_tts.json",
    JSON.stringify(englishVoices, null, 2),
  );

  console.log("\n✅ Disimpan ke english_voices_from_msedge_tts.json");

  fs.writeFileSync(
    "./public/indonesian_voices_from_msedge_tts.json",
    JSON.stringify(indonesiaVoices, null, 2),
  );
  console.log("\n✅ Disimpan ke indonesian_voices_from_msedge_tts.json");
}

main().catch(err => {
  console.error("Error while fetching voices:", err);
});
