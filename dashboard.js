let globalMaxZIndex = 2147483647;
const SAVE_DEBOUNCE_MS = 300;
const LOCAL_SAVE_IGNORE_MS = 500;
let lastLocalSaveAt = 0;

window.addEventListener('load', () => {
  loadNotes();
  loadBackgroundSettings();
  setupSettingsUI();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  if (changes.notes) {
    if (Date.now() - lastLocalSaveAt < LOCAL_SAVE_IGNORE_MS) return;
    removeAllRenderedNotes();
    loadNotes();
  }

  if (changes.globalSettings) {
    chrome.storage.local.get(['customBgImage'], (localRes) => {
      if (!localRes.customBgImage) {
        applyBackground(changes.globalSettings.newValue?.bgUrl);
      }
    });
  }
});

function removeAllRenderedNotes() {
  document.querySelectorAll('.sticky-note-card').forEach((card) => {
    if (typeof card.cleanupNote === 'function') {
      card.cleanupNote();
    }
    card.remove();
  });
}

function setupSettingsUI() {
  const modal = document.getElementById('settings-modal');
  const overlay = document.getElementById('modal-overlay');
  const btnSettings = document.getElementById('fab-settings');
  const btnSaveUrl = document.getElementById('btn-save-bg');
  const btnClear = document.getElementById('btn-clear-bg');
  const btnClose = document.getElementById('btn-close-bg');
  const inputUrl = document.getElementById('bg-url-input');
  const inputFile = document.getElementById('bg-file-input');

  btnSettings.onclick = () => {
    modal.style.display = 'block';
    overlay.style.display = 'block';
    chrome.storage.sync.get(['globalSettings'], (res) => {
      inputUrl.value = res.globalSettings?.bgUrl || '';
    });
    inputFile.value = '';
  };

  const closeModal = () => {
    modal.style.display = 'none';
    overlay.style.display = 'none';
  };
  btnClose.onclick = closeModal;
  overlay.onclick = closeModal;

  inputFile.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Please choose an image smaller than 5 MB.');
      inputFile.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const base64String = readerEvent.target.result;
      chrome.storage.local.set({ customBgImage: base64String }, () => {
        applyBackground(base64String);
        closeModal();
      });
    };
    reader.readAsDataURL(file);
  };

  btnSaveUrl.onclick = () => {
    const url = inputUrl.value.trim();
    if (!url) {
      alert('Please enter an image URL.');
      return;
    }

    chrome.storage.local.remove(['customBgImage'], () => {
      chrome.storage.sync.set({ globalSettings: { bgUrl: url } });
      applyBackground(url);
      closeModal();
    });
  };

  btnClear.onclick = () => {
    chrome.storage.local.remove(['customBgImage']);
    chrome.storage.sync.remove(['globalSettings']);
    applyBackground(null);
    closeModal();
  };
}

function loadBackgroundSettings() {
  chrome.storage.local.get(['customBgImage'], (localRes) => {
    if (localRes.customBgImage) {
      applyBackground(localRes.customBgImage);
      return;
    }

    chrome.storage.sync.get(['globalSettings'], (syncRes) => {
      applyBackground(syncRes.globalSettings?.bgUrl);
    });
  });
}

function applyBackground(imageSource) {
  if (imageSource) {
    document.body.style.backgroundImage = `url('${imageSource}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    return;
  }

  document.body.style.backgroundImage = 'radial-gradient(#ddd 1px, transparent 1px)';
  document.body.style.backgroundSize = '20px 20px';
  document.body.style.backgroundColor = '#f0f0f0';
}

document.getElementById('fab-add').addEventListener('click', () => {
  createNoteData('dashboard');
});

function loadNotes() {
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    notes.forEach((note) => renderNote(note));
  });
}

function createNoteData(targetUrl) {
  const newNote = {
    id: Date.now().toString(),
    content: '',
    x: 100 + Math.random() * 50,
    y: 100 + Math.random() * 50,
    width: 250,
    height: 250,
    color: '#fff7b1',
    url: targetUrl,
    reminder: '',
    zIndex: 10000
  };
  saveNoteToStorage(newNote);
  renderNote(newNote);
}

function saveNoteToStorage(noteData) {
  lastLocalSaveAt = Date.now();
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const index = notes.findIndex((note) => note.id === noteData.id);
    if (index > -1) {
      notes[index] = { ...noteData };
    } else {
      notes.push({ ...noteData });
    }
    chrome.storage.sync.set({ notes });
  });
}

function deleteNoteFromStorage(id) {
  lastLocalSaveAt = Date.now();
  clearReminder(id);
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = (result.notes || []).filter((note) => note.id !== id);
    chrome.storage.sync.set({ notes });
  });
}

function scheduleReminder(noteData) {
  chrome.runtime.sendMessage({
    type: 'scheduleReminder',
    noteId: noteData.id,
    reminderTime: noteData.reminder
  });
}

function clearReminder(noteId) {
  chrome.runtime.sendMessage({
    type: 'clearReminder',
    noteId
  });
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

function openSafeUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderNote(data) {
  if (document.getElementById(data.id)) return;

  let isDeleted = false;
  let resizeObserver;
  let timerInterval;
  let hasObservedInitialSize = false;

  const card = document.createElement('div');
  card.className = 'sticky-note-card';
  card.id = data.id;
  card.style.left = `${data.x}px`;
  card.style.top = `${data.y}px`;
  card.style.width = `${data.width}px`;
  card.style.height = `${data.height}px`;
  card.style.backgroundColor = data.color;
  card.style.zIndex = data.zIndex || 10000;

  const saveSize = debounce(() => {
    if (!isDeleted) saveNoteToStorage(data);
  }, SAVE_DEBOUNCE_MS);

  card.cleanupNote = () => {
    isDeleted = true;
    clearInterval(timerInterval);
    if (resizeObserver) resizeObserver.disconnect();
  };

  card.onmousedown = () => {
    globalMaxZIndex++;
    card.style.zIndex = globalMaxZIndex;
    data.zIndex = globalMaxZIndex;
    saveNoteToStorage(data);
  };

  const header = document.createElement('div');
  header.className = 'sticky-header';

  const leftControls = document.createElement('div');
  leftControls.style.display = 'flex';
  leftControls.style.gap = '5px';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = data.color;
  colorInput.title = 'Note color';
  colorInput.style.width = '20px';
  colorInput.style.height = '20px';
  colorInput.style.border = 'none';
  colorInput.style.cursor = 'pointer';
  colorInput.onmousedown = (event) => event.stopPropagation();
  colorInput.oninput = (event) => {
    card.style.backgroundColor = event.target.value;
    data.color = event.target.value;
    if (!isDeleted) saveNoteToStorage(data);
  };
  leftControls.appendChild(colorInput);

  if (data.url && data.url !== 'dashboard') {
    const jumpBtn = document.createElement('span');
    jumpBtn.innerText = 'open';
    jumpBtn.title = `Open ${data.url}`;
    jumpBtn.style.cursor = 'pointer';
    jumpBtn.onclick = (event) => {
      event.stopPropagation();
      let target = data.url;
      if (!target.startsWith('http')) target = `https://${target}`;
      openSafeUrl(target);
    };
    leftControls.appendChild(jumpBtn);
    card.style.borderLeft = '5px solid #ff9800';
  }

  const closeBtn = document.createElement('span');
  closeBtn.innerText = 'x';
  closeBtn.title = 'Delete note';
  closeBtn.className = 'close-btn';
  closeBtn.onmousedown = (event) => event.stopPropagation();
  closeBtn.onclick = () => {
    card.cleanupNote();
    card.remove();
    deleteNoteFromStorage(data.id);
  };

  header.appendChild(leftControls);
  header.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'sticky-content';
  content.contentEditable = true;
  content.innerHTML = linkify(data.content);

  content.addEventListener('mousedown', (event) => {
    if (event.target.tagName === 'A') {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSafeUrl(event.target.href);
    }
  });

  content.addEventListener('focus', () => {
    content.innerText = stripHtml(content.innerHTML);
  });

  content.addEventListener('blur', () => {
    if (isDeleted) return;
    const rawText = content.innerText;
    data.content = rawText;
    saveNoteToStorage(data);
    content.innerHTML = linkify(rawText);
  });

  const footer = document.createElement('div');
  footer.className = 'sticky-footer';

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'date-picker';
  dateInput.title = 'Reminder time';
  dateInput.value = data.reminder || '';
  dateInput.onmousedown = (event) => event.stopPropagation();

  const countdownDiv = document.createElement('div');
  countdownDiv.className = 'countdown-text';

  const updateTimer = () => {
    countdownDiv.innerText = getCountdownText(dateInput.value);
  };

  updateTimer();
  timerInterval = setInterval(updateTimer, 60000);

  dateInput.onchange = () => {
    if (isDeleted) return;
    data.reminder = dateInput.value;
    saveNoteToStorage(data);
    updateTimer();

    if (data.reminder) {
      scheduleReminder(data);
    } else {
      clearReminder(data.id);
    }
  };

  footer.appendChild(dateInput);
  footer.appendChild(countdownDiv);

  card.appendChild(header);
  card.appendChild(content);
  card.appendChild(footer);
  document.body.appendChild(card);

  let isDragging = false;
  let startX;
  let startY;
  let initialLeft;
  let initialTop;

  header.addEventListener('mousedown', (event) => {
    if (event.target !== header) return;
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    initialLeft = card.offsetLeft;
    initialTop = card.offsetTop;
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;
    card.style.left = `${initialLeft + event.clientX - startX}px`;
    card.style.top = `${initialTop + event.clientY - startY}px`;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    data.x = parseInt(card.style.left, 10);
    data.y = parseInt(card.style.top, 10);
    saveNoteToStorage(data);
  });

  resizeObserver = new ResizeObserver(() => {
    if (isDeleted) return;
    if (!hasObservedInitialSize) {
      hasObservedInitialSize = true;
      return;
    }
    data.width = parseInt(card.style.width, 10);
    data.height = parseInt(card.style.height, 10);
    saveSize();
  });
  resizeObserver.observe(card);
}
