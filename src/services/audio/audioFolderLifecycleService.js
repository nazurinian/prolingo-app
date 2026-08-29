export const executeAudioFolderSelectService = ({
  e,
  mode,
  localAudioMapTable,
  localAudioMapText,
  playlist,
  getRecordAudioNo,
  getVocabIdentity,
  getStableAudioIdentity,
  setLocalAudioMapTable,
  setAudioStatusTable,
  setLocalAudioMapText,
  setAudioStatusText
}) => {
    const files = e.target.files;
    if (!files) return;
    let count = 0;

    if (mode === 'table') {
        Object.values(localAudioMapTable).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (err) { console.warn("Failed to revoke URL:", err); }
        });

        const newMap = {};
        let orphanCount = 0;
        let audioFileCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (!(file.type.startsWith('audio/') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.webm'))) continue;
            audioFileCount++;

            let type = null;
            const expTypeMatch = lowerName.match(/(?:_|-)(exp[1-5]_(?:en|idn))\.(wav|mp3|ogg|webm)$/i);
            if (expTypeMatch) type = expTypeMatch[1].toLowerCase();
            else if (/(?:_|-)(word_idn|word-?idn|word_meaning|arti_kata)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'word_idn';
            else if (/(?:_|-)(word|kata)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'word';
            else if (/(?:_|-)(sentence|sent|kalimat)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'sentence';
            else if (/(?:_|-)(meaning|mean|arti)\.(wav|mp3|ogg|webm)$/i.test(lowerName)) type = 'meaning';
            else if (lowerName.includes('_word_idn.') || lowerName.includes('_arti_kata.')) type = 'word_idn';
            else if (lowerName.includes('_word.') || lowerName.includes('_kata.')) type = 'word';
            else if (lowerName.includes('_sentence.') || lowerName.includes('_kalimat.')) type = 'sentence';
            else if (lowerName.includes('_meaning.') || lowerName.includes('_arti.')) type = 'meaning';
            if (!type) continue;

            const stableMatch = file.name.match(/^([A-Za-z][A-Za-z0-9-]*_\d+)_/);
            const numericMatch = file.name.match(/^(\d+)_/);
            let matchedItem = null;

            // Preferred/legacy path: numeric prefix is the permanent audio slot.
            if (numericMatch) {
                const audioNo = Number.parseInt(numericMatch[1], 10);
                matchedItem = playlist.find(item => item.isStructured && getRecordAudioNo(item) === audioNo) || null;
            }
            // Compatibility with v5.8 ID-first filenames (BODY_0001_..., USR_000001_...).
            if (!matchedItem && stableMatch) {
                const oldVocabId = stableMatch[1].toUpperCase();
                matchedItem = playlist.find(item => item.isStructured && getVocabIdentity(item) === oldVocabId) || null;
            }

            if (matchedItem) {
                const identity = getStableAudioIdentity(matchedItem);
                newMap[`${identity}_${type}`] = URL.createObjectURL(file);
                count++;
            } else {
                orphanCount++;
            }
        }

        setLocalAudioMapTable(newMap);
        setAudioStatusTable(count > 0 ? 'success' : 'empty');
        alert(`[Table] Audio scan: ${audioFileCount} file. Matched: ${count}. Orphan/unmatched: ${orphanCount}.\nNO audio tidak pernah dialihkan ke vocab lain.`);
    } else {
        Object.values(localAudioMapText).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (err) { console.warn("Failed to revoke URL:", err); }
        });

        const newMap = {};
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (!(file.type.startsWith('audio/') || lowerName.endsWith('.wav') || lowerName.endsWith('.mp3') || lowerName.endsWith('.ogg') || lowerName.endsWith('.webm'))) continue;

            const textMatch = file.name.match(/^(TEXT_\d+)_/i);
            const numericMatch = file.name.match(/^(\d+)_/);
            let identity = textMatch ? textMatch[1].toUpperCase() : null;
            if (!identity && numericMatch) identity = `TEXT_${String(Number.parseInt(numericMatch[1], 10)).padStart(6, '0')}`;

            if (identity) {
                newMap[identity] = URL.createObjectURL(file);
                count++;
            }
        }
        setLocalAudioMapText(newMap);
        setAudioStatusText(count > 0 ? 'success' : 'empty');
        alert(`[Text] Loaded ${count} files. Old files cleared.`);
    }

    e.target.value = '';
};
