let globalMaxZIndex = 2147483647;
const currentUrl = window.location.hostname + window.location.pathname;
const SAVE_DEBOUNCE_MS = 300;
const LOCAL_SAVE_IGNORE_MS = 500;
const FLOATING_BUTTON_POSITION_KEY = 'floatingButtonPosition';
let lastLocalSaveAt = 0;

window.addEventListener('load', () => {
  createFloatingButton();
  loadPageNotes();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.notes) {
    if (Date.now() - lastLocalSaveAt < LOCAL_SAVE_IGNORE_MS) return;
    removeAllRenderedNotes();
    loadPageNotes();
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

function createFloatingButton() {
  if (document.getElementById('syncsticky-add-button')) return;

  const btn = document.createElement('div');
  btn.id = 'syncsticky-add-button';
  btn.innerText = '+';
  btn.style.cssText = `
    position: fixed; width: 40px; height: 40px;
    background: rgba(0,0,0,0.5); color: white; border-radius: 50%;
    text-align: center; line-height: 38px; font-size: 24px; cursor: pointer;
    z-index: 2147483647; user-select: none; transition: background 0.3s;
  `;
  btn.title = 'Add sticky note';
  btn.onmouseover = () => btn.style.background = 'rgba(0,0,0,0.8)';
  btn.onmouseout = () => btn.style.background = 'rgba(0,0,0,0.5)';
  document.body.appendChild(btn);
  setupFloatingButtonPosition(btn);
}

function setupFloatingButtonPosition(btn) {
  const defaultPosition = getDefaultFloatingButtonPosition(btn);
  let wasDragged = false;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  chrome.storage.local.get([FLOATING_BUTTON_POSITION_KEY], (result) => {
    const savedPosition = result[FLOATING_BUTTON_POSITION_KEY];
    const position = normalizeFloatingButtonPosition(savedPosition, defaultPosition, btn);
    applyFloatingButtonPosition(btn, position);
  });

  btn.addEventListener('mousedown', (event) => {
    event.preventDefault();
    isDragging = true;
    wasDragged = false;
    startX = event.clientX;
    startY = event.clientY;
    initialLeft = btn.offsetLeft;
    initialTop = btn.offsetTop;
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;

    const nextPosition = normalizeFloatingButtonPosition({
      left: initialLeft + event.clientX - startX,
      top: initialTop + event.clientY - startY
    }, defaultPosition, btn);

    if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) {
      wasDragged = true;
    }
    applyFloatingButtonPosition(btn, nextPosition);
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;

    const position = {
      left: btn.offsetLeft,
      top: btn.offsetTop
    };
    chrome.storage.local.set({ [FLOATING_BUTTON_POSITION_KEY]: position });

    if (!wasDragged) {
      createNoteData(currentUrl);
    }
  });

  window.addEventListener('resize', () => {
    const position = normalizeFloatingButtonPosition({
      left: btn.offsetLeft,
      top: btn.offsetTop
    }, defaultPosition, btn);
    applyFloatingButtonPosition(btn, position);
    chrome.storage.local.set({ [FLOATING_BUTTON_POSITION_KEY]: position });
  });
}

function getDefaultFloatingButtonPosition(btn) {
  return {
    left: window.innerWidth - btn.offsetWidth - 20,
    top: window.innerHeight - btn.offsetHeight - 20
  };
}

function normalizeFloatingButtonPosition(position, fallbackPosition, btn) {
  const rawLeft = Number.isFinite(position?.left) ? position.left : fallbackPosition.left;
  const rawTop = Number.isFinite(position?.top) ? position.top : fallbackPosition.top;
  return {
    left: Math.min(Math.max(rawLeft, 0), window.innerWidth - btn.offsetWidth),
    top: Math.min(Math.max(rawTop, 0), window.innerHeight - btn.offsetHeight)
  };
}

function applyFloatingButtonPosition(btn, position) {
  btn.style.left = `${position.left}px`;
  btn.style.top = `${position.top}px`;
}

function loadPageNotes() {
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const pageNotes = notes.filter((note) => note.url === currentUrl);
    pageNotes.forEach((note) => renderNote(note));
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
  card.style.position = 'fixed';
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

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = data.color;
  colorInput.title = 'Note color';
  colorInput.style.cssText = 'width: 20px; height: 20px; border: none; cursor: pointer; margin-right: 5px;';
  colorInput.onmousedown = (event) => event.stopPropagation();
  colorInput.oninput = (event) => {
    card.style.backgroundColor = event.target.value;
    data.color = event.target.value;
    if (!isDeleted) saveNoteToStorage(data);
  };
  leftControls.appendChild(colorInput);

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
