(() => {
  const LEGACY_NOTES_KEY = 'notes';
  const NOTE_KEY_PREFIX = 'note:';

  function syncGet(keys = null) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => resolve(result));
    });
  }

  function syncSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(values, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function syncRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function noteKey(noteId) {
    return `${NOTE_KEY_PREFIX}${noteId}`;
  }

  function isNoteStorageKey(key) {
    return typeof key === 'string' && key.startsWith(NOTE_KEY_PREFIX);
  }

  function getTimeValue(value) {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  }

  function dedupeNotes(notes) {
    const notesById = new Map();
    (Array.isArray(notes) ? notes : []).forEach((note) => {
      if (!note || !note.id) return;
      const current = notesById.get(note.id);
      if (!current || getTimeValue(note.updatedAt) >= getTimeValue(current.updatedAt)) {
        notesById.set(note.id, note);
      }
    });
    return Array.from(notesById.values());
  }

  function getStoredNotes(syncData) {
    return dedupeNotes(
      Object.entries(syncData || {})
        .filter(([key]) => isNoteStorageKey(key))
        .map(([, value]) => value)
    );
  }

  async function migrateLegacyNotes(syncData) {
    const legacyNotes = Array.isArray(syncData?.[LEGACY_NOTES_KEY]) ? syncData[LEGACY_NOTES_KEY] : [];
    const mergedNotes = dedupeNotes([
      ...getStoredNotes(syncData),
      ...legacyNotes
    ]);

    if (mergedNotes.length) {
      const payload = {};
      mergedNotes.forEach((note) => {
        payload[noteKey(note.id)] = note;
      });
      await syncSet(payload);
    }

    await syncRemove(LEGACY_NOTES_KEY);
    return mergedNotes;
  }

  async function loadNotes() {
    const syncData = await syncGet(null);
    if (Array.isArray(syncData?.[LEGACY_NOTES_KEY]) && syncData[LEGACY_NOTES_KEY].length) {
      return migrateLegacyNotes(syncData);
    }
    return getStoredNotes(syncData);
  }

  async function saveNote(note) {
    if (!note || !note.id) throw new Error('Missing note id.');
    await syncSet({ [noteKey(note.id)]: note });
  }

  async function removeNote(noteId) {
    if (!noteId) return;
    await syncRemove(noteKey(noteId));
  }

  async function replaceAllNotes(notes) {
    const syncData = await syncGet(null);
    const nextNotes = dedupeNotes(notes);
    const nextKeys = new Set(nextNotes.map((note) => noteKey(note.id)));
    const payload = {};

    nextNotes.forEach((note) => {
      payload[noteKey(note.id)] = note;
    });

    if (Object.keys(payload).length) {
      await syncSet(payload);
    }

    const removeKeys = Object.keys(syncData).filter((key) => {
      return key === LEGACY_NOTES_KEY || (isNoteStorageKey(key) && !nextKeys.has(key));
    });

    if (removeKeys.length) {
      await syncRemove(removeKeys);
    }
  }

  function getByteSize(value) {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  }

  function getStorageAreaByteSize(data) {
    return Object.entries(data || {}).reduce((total, [key, value]) => {
      return total + key.length + getByteSize(value);
    }, 0);
  }

  async function getStorageStats() {
    await loadNotes();
    const syncData = await syncGet(null);
    const notes = getStoredNotes(syncData);
    const noteItems = notes
      .map((note) => {
        const key = noteKey(note.id);
        const bytes = getByteSize(note) + key.length;
        return {
          id: note.id,
          key,
          bytes,
          contentLength: String(note.content || '').length,
          preview: String(note.content || '').slice(0, 80)
        };
      })
      .sort((a, b) => b.bytes - a.bytes);

    return {
      totalSyncBytes: getStorageAreaByteSize(syncData),
      noteCount: notes.length,
      noteItemCount: noteItems.length,
      largestNoteBytes: noteItems[0]?.bytes || 0,
      largestNoteContentLength: noteItems[0]?.contentLength || 0,
      noteItems
    };
  }

  function hasNoteStorageChange(changes, area) {
    if (area !== 'sync') return false;
    return Object.keys(changes || {}).some((key) => key === LEGACY_NOTES_KEY || isNoteStorageKey(key));
  }

  globalThis.SyncStickyNoteStore = {
    LEGACY_NOTES_KEY,
    NOTE_KEY_PREFIX,
    isNoteStorageKey,
    hasNoteStorageChange,
    loadNotes,
    saveNote,
    removeNote,
    replaceAllNotes,
    getStorageStats
  };
})();
