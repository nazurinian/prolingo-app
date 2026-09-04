import { getItemPartText } from '../../utils/audioUtils';
import { capitalizeDisplayText } from '../../utils/displayTextUtils';

export const executeMediaSessionLifecycleService = ({
  currentPlayerList, playbackContextRef, playingIndex, speakingPart, currentDeckName, isPlaying, isPaused,
  currentAudioObjRef, mediaIntervalRef, resumePlaybackRef, playRef, pausePlaybackRef, navRef, stopRef, pauseStateRef
}) => {
        if (!('mediaSession' in navigator)) return;

        // D2: metadata belongs to the active playback session, not the current
        // filtered/visible UI list. The visible list is only a compatibility fallback.
        const sessionList = playbackContextRef?.current?.orderedList;
        const activeItem = (Array.isArray(sessionList) ? sessionList : currentPlayerList)
            .find(p => p.id === playingIndex);
        if (!activeItem) {
            // A real Stop removes the active item. Clear any timeline previously
            // published for local/generated audio so Android does not keep stale
            // duration/position data after the playback session has ended.
            try {
                navigator.mediaSession.setPositionState?.({});
            } catch (_) {}
            return;
        }

        // 2. Tentukan Metadata Awal
        let title = activeItem.word ? capitalizeDisplayText(activeItem.word) : (activeItem.text ? capitalizeDisplayText(activeItem.text) : "Unknown Item");
        let artist = "ProLingo Audio";

        // Jika mode Table
        if (activeItem.isStructured) {
            artist = activeItem.sentence || "Sentence Practice";
        }

        // Jika sedang memutar bagian Meaning
        if (speakingPart === 'word_idn') {
            title = `Arti kata: ${capitalizeDisplayText(activeItem.meaningWord)}`;
            artist = activeItem.word ? capitalizeDisplayText(activeItem.word) : 'Word Translation';
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
            artist = `${activeItem.word ? capitalizeDisplayText(activeItem.word) : (activeItem.vocabId || 'ProLingo')} • Advanced Practice`;
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

        // Keep Android/system media metadata static for the lifetime of the
        // current logical playback part. Replacing MediaMetadata every 200 ms
        // for a marquee can make the OS media notification rebuild its artwork
        // and timing surface repeatedly (visible as flicker/reset).
        if (mediaIntervalRef.current) {
            clearInterval(mediaIntervalRef.current);
            mediaIntervalRef.current = null;
        }

        // Publish the timeline from the REAL local/generated MP3, not from the
        // 30-second silent background anchor. Android can otherwise alternate
        // between the anchor duration and the real track, which presents as a
        // missing/incorrect progress bar. MediaSession position state is designed
        // specifically to tell the OS which duration/position belongs to the
        // logical media currently being presented.
        const syncLocalAudioPosition = () => {
            const audio = currentAudioObjRef?.current;
            if (!audio || typeof navigator.mediaSession.setPositionState !== 'function') return;

            const duration = Number(audio.duration);
            if (!Number.isFinite(duration) || duration <= 0) return;

            const rawPosition = Number(audio.currentTime);
            const position = Math.min(
                duration,
                Math.max(0, Number.isFinite(rawPosition) ? rawPosition : 0)
            );
            const rawRate = Number(audio.playbackRate);
            const playbackRate = Number.isFinite(rawRate) && rawRate !== 0 ? rawRate : 1;

            try {
                navigator.mediaSession.setPositionState({
                    duration,
                    playbackRate,
                    position
                });
            } catch (error) {
                // Position state is an enhancement. Never let an unsupported or
                // transient media value interrupt the actual playback session.
            }
        };

        // One immediate attempt plus a light sync cadence catches loadedmetadata
        // on newly-created Audio elements. The OS can extrapolate between these
        // reports, so there is no need for the old 200 ms metadata churn.
        syncLocalAudioPosition();
        mediaIntervalRef.current = setInterval(syncLocalAudioPosition, 500);

        // 4. Set Action Handlers (STABLE with refs)
        // Media-session actions can arrive while React rendering is throttled in
        // the Android background. Do not decide Play vs Resume from captured
        // isPaused/isPlaying values; playbackState is updated synchronously by
        // the playback controls and remains the media-session source of truth.
        const registerAction = (action, handler) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (error) {
                console.warn(`MediaSession action unsupported: ${action}`, error);
            }
        };

        registerAction("play", () => {
            // Android may derive playbackState from the silent HTMLAudioElement
            // and update it later than ProLingo's own Pause state. Use the
            // realtime pause ref first so a lock-screen Play always resumes the
            // existing TTS/local session instead of being ignored.
            if (pauseStateRef?.current) {
                resumePlaybackRef.current();
                return;
            }
            if (navigator.mediaSession.playbackState !== "playing") {
                playRef.current();
            }
        });
        registerAction("pause", () => pausePlaybackRef.current({ source: 'mediaSession' }));
        registerAction("previoustrack", () => navRef.current("prev"));
        registerAction("nexttrack", () => navRef.current("next"));
        registerAction("stop", () => stopRef.current());

        // Cleanup saat unmount atau track berubah
        return () => {
            if (mediaIntervalRef.current) {
                clearInterval(mediaIntervalRef.current);
            }
        };

};
