(() => {
  const DEFAULT_TAB_ID = 'default';
  const DEFAULT_NOTE_STATUS = 'discussion';

  function getTimestamp() {
    return new Date().toISOString();
  }

  function debounce(callback, delay) {
    let timerId;
    return () => {
      clearTimeout(timerId);
      timerId = setTimeout(callback, delay);
    };
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function linkify(text) {
    const escapedText = escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return escapedText.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  }

  function getNoteHtml(note) {
    return linkify(note.content);
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.innerText;
  }

  function getCountdownText(reminderValue) {
    if (!reminderValue) return '';

    const targetTime = new Date(reminderValue).getTime();
    const diff = targetTime - Date.now();
    if (!Number.isFinite(targetTime)) return '';
    if (diff <= 0) return 'Due now';

    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (days > 0) return `${days}d ${hrs % 24}h left`;
    if (hrs > 0) return `${hrs}h ${mins % 60}m left`;
    return `${mins}m left`;
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
  }

  function normalizeAppSettings(settings) {
    return {
      addButtonEnabled: settings?.addButtonEnabled !== false,
      updatedAt: settings?.updatedAt || ''
    };
  }

  // Canonical note normalizer. This is the more defensive of the two
  // implementations that used to live separately in content.js and
  // dashboard.js: it also guards minimized/minimizedX/minimizedY, which
  // the old dashboard.js version did not.
  function normalizeNote(note) {
    const { contentHtml, ...syncNote } = note || {};
    return {
      ...syncNote,
      status: syncNote.status || DEFAULT_NOTE_STATUS,
      tabId: syncNote.tabId || DEFAULT_TAB_ID,
      edgeReminder: Boolean(syncNote.edgeReminder),
      minimized: Boolean(syncNote.minimized),
      minimizedX: Number.isFinite(syncNote.minimizedX) ? syncNote.minimizedX : 12,
      minimizedY: Number.isFinite(syncNote.minimizedY) ? syncNote.minimizedY : 12
    };
  }

  function openSafeUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function scheduleReminder(noteData) {
    try {
      chrome.runtime.sendMessage({
        type: 'scheduleReminder',
        noteId: noteData.id,
        reminderTime: noteData.reminder
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn(`Could not schedule reminder: ${chrome.runtime.lastError.message}`);
        }
      });
    } catch (error) {
      console.warn(`Could not schedule reminder: ${error.message}`);
    }
  }

  function clearReminder(noteId) {
    try {
      chrome.runtime.sendMessage({
        type: 'clearReminder',
        noteId
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn(`Could not clear reminder: ${chrome.runtime.lastError.message}`);
        }
      });
    } catch (error) {
      console.warn(`Could not clear reminder: ${error.message}`);
    }
  }

  globalThis.SyncStickyNoteUtils = {
    DEFAULT_TAB_ID,
    DEFAULT_NOTE_STATUS,
    getTimestamp,
    debounce,
    escapeHtml,
    linkify,
    getNoteHtml,
    stripHtml,
    getCountdownText,
    isHexColor,
    normalizeAppSettings,
    normalizeNote,
    openSafeUrl,
    scheduleReminder,
    clearReminder
  };
})();
