const SAVE_DEBOUNCE_MS = 300;
const LOCAL_SAVE_IGNORE_MS = 500;
const DEFAULT_NOTE_STATUS = 'discussion';
const TODO_STATUSES = [
  { value: 'discussion', label: '討論中' },
  { value: 'waiting', label: '等待中' },
  { value: 'doing', label: '執行中' },
  { value: 'done', label: '已完成' }
];
let lastLocalSaveAt = 0;

window.addEventListener('load', () => {
  loadNotes();
  loadBackgroundSettings();
  setupSettingsUI();
  setupTodoBoardDnd();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  if (changes.notes) {
    if (Date.now() - lastLocalSaveAt < LOCAL_SAVE_IGNORE_MS) return;
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

function setupSettingsUI() {
  const modal = document.getElementById('settings-modal');
  const overlay = document.getElementById('modal-overlay');
  const btnSettings = document.getElementById('fab-settings');
  const btnAddNote = document.getElementById('btn-add-note');
  const btnSaveUrl = document.getElementById('btn-save-bg');
  const btnClear = document.getElementById('btn-clear-bg');
  const btnClose = document.getElementById('btn-close-bg');
  const inputUrl = document.getElementById('bg-url-input');
  const inputFile = document.getElementById('bg-file-input');

  btnAddNote.onclick = () => {
    createNoteData('dashboard');
  };

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

function loadNotes() {
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = (result.notes || []).map(normalizeNote);
    renderTodoBoard(notes);
  });
}

function normalizeNote(note) {
  return {
    ...note,
    status: TODO_STATUSES.some((status) => status.value === note.status) ? note.status : DEFAULT_NOTE_STATUS
  };
}

function renderTodoBoard(notes) {
  TODO_STATUSES.forEach((status) => {
    const list = document.querySelector(`[data-list="${status.value}"]`);
    const count = document.querySelector(`[data-count="${status.value}"]`);
    const statusNotes = notes.filter((note) => note.status === status.value);
    list.innerHTML = '';
    statusNotes.forEach((note) => list.appendChild(renderTodoCard(note)));
    count.innerText = String(statusNotes.length);
  });
}

function setupTodoBoardDnd() {
  document.querySelectorAll('.todo-list').forEach((list) => {
    list.addEventListener('dragover', (event) => {
      event.preventDefault();
      list.classList.add('todo-list-over');
    });

    list.addEventListener('dragleave', () => {
      list.classList.remove('todo-list-over');
    });

    list.addEventListener('drop', (event) => {
      event.preventDefault();
      list.classList.remove('todo-list-over');
      const noteId = event.dataTransfer.getData('text/plain');
      const nextStatus = list.dataset.list;
      if (!noteId || !nextStatus) return;
      updateNote(noteId, (note) => ({ ...note, status: nextStatus }), loadNotes);
    });
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
    zIndex: 10000,
    status: DEFAULT_NOTE_STATUS,
    minimized: false,
    minimizedX: 12,
    minimizedY: 12
  };
  saveNoteToStorage(newNote, loadNotes);
}

function saveNoteToStorage(noteData, afterSave) {
  lastLocalSaveAt = Date.now();
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const normalizedNote = normalizeNote(noteData);
    const index = notes.findIndex((note) => note.id === normalizedNote.id);
    if (index > -1) {
      notes[index] = { ...normalizedNote };
    } else {
      notes.push({ ...normalizedNote });
    }
    chrome.storage.sync.set({ notes }, () => {
      if (typeof afterSave === 'function') afterSave();
    });
  });
}

function deleteNoteFromStorage(id, afterDelete) {
  lastLocalSaveAt = Date.now();
  clearReminder(id);
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = (result.notes || []).filter((note) => note.id !== id);
    chrome.storage.sync.set({ notes }, () => {
      if (typeof afterDelete === 'function') afterDelete();
    });
  });
}

function updateNote(id, updater, afterUpdate) {
  lastLocalSaveAt = Date.now();
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const index = notes.findIndex((note) => note.id === id);
    if (index === -1) return;
    notes[index] = normalizeNote(updater(notes[index]));
    chrome.storage.sync.set({ notes }, () => {
      if (typeof afterUpdate === 'function') afterUpdate();
    });
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

function openSafeUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderTodoCard(note) {
  const card = document.createElement('article');
  card.className = 'todo-card';
  card.draggable = true;
  card.style.backgroundColor = note.color;

  card.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', note.id);
    event.dataTransfer.effectAllowed = 'move';
  });

  const content = document.createElement('div');
  content.className = 'todo-content';
  content.contentEditable = true;
  content.innerHTML = linkify(note.content);

  const saveContent = debounce(() => {
    note.content = content.innerText;
    saveNoteToStorage(note);
  }, SAVE_DEBOUNCE_MS);

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

  content.addEventListener('input', saveContent);

  content.addEventListener('blur', () => {
    note.content = content.innerText;
    saveNoteToStorage(note, loadNotes);
  });

  const meta = document.createElement('div');
  meta.className = 'todo-meta';
  meta.innerText = note.url === 'dashboard' ? 'Dashboard note' : note.url;

  const actions = document.createElement('div');
  actions.className = 'todo-actions';

  const statusSelect = document.createElement('select');
  statusSelect.className = 'todo-status';
  TODO_STATUSES.forEach((status) => {
    const option = document.createElement('option');
    option.value = status.value;
    option.innerText = status.label;
    option.selected = note.status === status.value;
    statusSelect.appendChild(option);
  });
  statusSelect.onchange = () => {
    note.status = statusSelect.value;
    saveNoteToStorage(note, loadNotes);
  };

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'todo-action-btn';
  openBtn.innerText = 'Open';
  openBtn.disabled = !note.url || note.url === 'dashboard';
  openBtn.onclick = () => {
    let target = note.url;
    if (!target.startsWith('http')) target = `https://${target}`;
    openSafeUrl(target);
  };

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'todo-action-btn';
  deleteBtn.innerText = 'Del';
  deleteBtn.onclick = () => {
    deleteNoteFromStorage(note.id, loadNotes);
  };

  actions.appendChild(statusSelect);
  actions.appendChild(openBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(content);
  card.appendChild(meta);
  card.appendChild(actions);
  return card;
}
