import { getItemPartText } from '../../utils/audioUtils';

export const executeMediaSessionLifecycleService = ({
  currentPlayerList, playingIndex, speakingPart, currentDeckName, isPlaying, isPaused,
  mediaIntervalRef, resumePlaybackRef, playRef, pausePlaybackRef, navRef, stopRef
}) => {
        if (!('mediaSession' in navigator)) return;

        // 1. Tentukan Item yang sedang aktif
        const activeItem = currentPlayerList.find(p => p.id === playingIndex);
        if (!activeItem) return;

        // 2. Tentukan Metadata Awal
        let title = activeItem.word || activeItem.text || "Unknown Item";
        let artist = "ProLingo Audio";

        // Jika mode Table
        if (activeItem.isStructured) {
            artist = activeItem.sentence || "Sentence Practice";
        }

        // Jika sedang memutar bagian Meaning
        if (speakingPart === 'word_idn') {
            title = `Arti kata: ${activeItem.meaningWord}`;
            artist = activeItem.word || 'Word Translation';
        }
        if (speakingPart === "meaning") {
            title = `Terjemahan kalimat: ${activeItem.meaning}`;
        }
        const activeExpMatch = String(speakingPart || '').match(/^exp([1-5])_(en|idn)$/i);
        if (activeExpMatch) {
            const expNo = activeExpMatch[1];
            const lang = activeExpMatch[2].toLowerCase();
            const expText = getItemPartText(activeItem, `exp${expNo}_${lang}`);
            title = `EXP${expNo}${lang === 'idn' ? ' IDN' : ''}: ${expText}`;
            artist = `${activeItem.word || activeItem.vocabId || 'ProLingo'} • Advanced Practice`;
        }

        // --- FUNGSI UPDATE METADATA (Helper) ---
        const updateMetadata = (t, a) => {
             navigator.mediaSession.metadata = new MediaMetadata({
                title: t,
                artist: a,
                album: currentDeckName || "ProLingo Deck",
                artwork: [
                    { 
                        src: "https://cdn-icons-png.flaticon.com/512/2995/2995101.png",
                        sizes: "512x512",
                        type: "image/png"
                    }
                ]
            });
        };

        // Set Awal (Static)
        updateMetadata(title, artist);

        // --- NEW: LOGIKA TEKS BERJALAN (MARQUEE) ---
        // Bersihkan interval sebelumnya jika ada
        if (mediaIntervalRef.current) {
            clearInterval(mediaIntervalRef.current);
            mediaIntervalRef.current = null;
        }

        // Hanya jalankan scroll jika sedang PLAYING dan teksnya PANJANG
        if (isPlaying) {
             const needScrollTitle = title.length > 25;
             const needScrollArtist = artist.length > 35; // Biasanya kalimat panjang disini

             if (needScrollTitle || needScrollArtist) {
                 // Tambah padding spasi di akhir supaya muternya enak dilihat
                 const combinedTitle = title + "     "; 
                 const combinedArtist = artist + "     ";
                 
                 let tCount = 0;
                 let aCount = 0;

                 // MODIFIED: Speed to 200ms for smoother scroll
                 mediaIntervalRef.current = setInterval(() => {
                     let displayTitle = title;
                     let displayArtist = artist;

                     // Logika Geser Title
                     if (needScrollTitle) {
                         const offset = tCount % combinedTitle.length;
                         displayTitle = combinedTitle.slice(offset) + combinedTitle.slice(0, offset);
                         tCount++;
                     }

                     // Logika Geser Artist
                     if (needScrollArtist) {
                         const offset = aCount % combinedArtist.length;
                         displayArtist = combinedArtist.slice(offset) + combinedArtist.slice(0, offset);
                         aCount++;
                     }
                     
                     // Update Tampilan Widget
                     updateMetadata(displayTitle, displayArtist);
                 }, 200); // REVISED: 1000ms -> 200ms
             }
        }

        // 4. Set Action Handlers (STABLE with refs)
        navigator.mediaSession.setActionHandler("play", () => {
            if (isPaused) resumePlaybackRef.current();
            else if (!isPlaying) playRef.current();
        });
        navigator.mediaSession.setActionHandler("pause", () => pausePlaybackRef.current());
        navigator.mediaSession.setActionHandler("previoustrack", () => navRef.current("prev"));
        navigator.mediaSession.setActionHandler("nexttrack", () => navRef.current("next"));
        navigator.mediaSession.setActionHandler("stop", () => stopRef.current());

        // Cleanup saat unmount atau track berubah
        return () => {
            if (mediaIntervalRef.current) {
                clearInterval(mediaIntervalRef.current);
            }
        };

};
