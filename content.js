let globalMaxZIndex = 2147483647;
const currentUrl = window.location.hostname + window.location.pathname;
const SAVE_DEBOUNCE_MS = 300;
const LOCAL_SAVE_IGNORE_MS = 500;
const FLOATING_BUTTON_POSITION_KEY = 'floatingButtonPosition';
const EDGE_BAR_SETTINGS_KEY = 'edgeReminderBarSettings';
const EDGE_BAR_ID = 'syncsticky-edge-reminder-bar';
const DEFAULT_TAB_ID = 'default';
const DEFAULT_NOTE_STATUS = 'discussion';
let lastLocalSaveAt = 0;

window.addEventListener('load', () => {
  createFloatingButton();
  loadPageNotes();
  loadEdgeReminderBar();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.notes) {
    if (Date.now() - lastLocalSaveAt >= LOCAL_SAVE_IGNORE_MS) {
      removeAllRenderedNotes();
      loadPageNotes();
    }
    loadEdgeReminderBar();
  }

  if (area === 'sync' && changes.boardSettings) {
    loadEdgeReminderBar();
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

function normalizeFloatingButtonPosition(position, fallbackPosition, element) {
  const rawLeft = Number.isFinite(position?.left) ? position.left : fallbackPosition.left;
  const rawTop = Number.isFinite(position?.top) ? position.top : fallbackPosition.top;
  return {
    left: Math.min(Math.max(rawLeft, 0), window.innerWidth - element.offsetWidth),
    top: Math.min(Math.max(rawTop, 0), window.innerHeight - element.offsetHeight)
  };
}

function applyFloatingButtonPosition(element, position) {
  element.style.left = `${position.left}px`;
  element.style.top = `${position.top}px`;
}

function loadEdgeReminderBar() {
  chrome.storage.sync.get(['notes', 'boardSettings'], (syncResult) => {
    const groups = getEdgeReminderGroups(syncResult.notes || [], syncResult.boardSettings);
    chrome.storage.local.get([EDGE_BAR_SETTINGS_KEY], (localResult) => {
      const settings = normalizeEdgeBarSettings(localResult[EDGE_BAR_SETTINGS_KEY]);
      renderEdgeReminderBar(groups, settings);
    });
  });
}

function getEdgeReminderGroups(notes, boardSettings) {
  const tabs = Array.isArray(boardSettings?.tabs) && boardSettings.tabs.length
    ? boardSettings.tabs
    : [{ id: DEFAULT_TAB_ID, label: 'Default', statuses: [{ id: DEFAULT_NOTE_STATUS, label: 'Discussion', color: '#c98219' }] }];
  const groups = new Map();
  notes.map(normalizeNote)
    .filter((note) => note.edgeReminder)
    .forEach((note) => {
      const tab = tabs.find((item) => item.id === note.tabId) || tabs[0];
      const statuses = Array.isArray(tab.statuses) && tab.statuses.length ? tab.statuses : tabs[0].statuses;
      const status = statuses.find((item) => item.id === note.status) || statuses[0];
      const key = `${tab.id}:${status.id}`;
      const existing = groups.get(key) || {
        tabId: tab.id,
        tabLabel: tab.label || 'Default',
        statusId: status.id,
        statusLabel: status.label || 'Status',
        color: isHexColor(status.color) ? status.color : '#c98219',
        count: 0
      };
      existing.count += 1;
      groups.set(key, existing);
    });
  return Array.from(groups.values());
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function normalizeEdgeBarSettings(settings) {
  return {
    left: Number.isFinite(settings?.left) ? settings.left : window.innerWidth - 52,
    top: Number.isFinite(settings?.top) ? settings.top : 90,
    opacity: Number.isFinite(settings?.opacity) ? Math.min(Math.max(settings.opacity, 0.2), 1) : 0.82
  };
}

function saveEdgeBarSettings(settings) {
  chrome.storage.local.set({ [EDGE_BAR_SETTINGS_KEY]: settings });
}

function renderEdgeReminderBar(groups, settings) {
  const existing = document.getElementById(EDGE_BAR_ID);
  if (!groups.length) {
    if (existing) existing.remove();
    return;
  }

  const bar = existing || document.createElement('div');
  bar.id = EDGE_BAR_ID;
  bar.innerHTML = '';
  bar.style.cssText = `
    position: fixed;
    left: ${Math.min(Math.max(settings.left, 0), window.innerWidth - 48)}px;
    top: ${Math.min(Math.max(settings.top, 0), window.innerHeight - 80)}px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 42px;
    padding: 6px 4px;
    border-radius: 8px;
    background: rgba(20,22,20,${settings.opacity * 0.54});
    box-shadow: 0 10px 24px rgba(0,0,0,0.22);
    cursor: grab;
    user-select: none;
    color-scheme: light;
    font-family: "Bahnschrift", "Aptos", "Segoe UI", sans-serif;
  `;
  bar.title = 'SyncSticky edge reminders';

  groups.forEach((group) => {
    const item = document.createElement('div');
    item.style.cssText = `
      min-height: 32px;
      border-radius: 6px;
      background: ${group.color};
      color: #1f2320;
      border: 1px solid rgba(31,35,32,0.18);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      font-weight: 900;
      opacity: ${settings.opacity};
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.32);
      overflow: hidden;
    `;
    const count = document.createElement('span');
    count.style.cssText = 'font-size: 12px; line-height: 1;';
    count.innerText = String(group.count);

    const label = document.createElement('span');
    label.style.cssText = 'max-width: 34px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8px; line-height: 1;';
    label.innerText = group.tabLabel;

    item.appendChild(count);
    item.appendChild(label);
    item.title = `${group.tabLabel}/${group.statusLabel}: ${group.count} reminder item(s)`;
    bar.appendChild(item);
  });

  const opacityInput = document.createElement('input');
  opacityInput.type = 'range';
  opacityInput.min = '0.2';
  opacityInput.max = '1';
  opacityInput.step = '0.05';
  opacityInput.value = String(settings.opacity);
  opacityInput.title = 'Opacity';
  opacityInput.style.cssText = `
    width: 40px;
    height: 18px;
    margin: 2px 0 0;
    accent-color: #0f766e;
    cursor: pointer;
  `;
  opacityInput.onmousedown = (event) => event.stopPropagation();
  opacityInput.oninput = () => {
    settings.opacity = Number(opacityInput.value);
    saveEdgeBarSettings(settings);
    loadEdgeReminderBar();
  };
  bar.appendChild(opacityInput);

  if (!existing) {
    document.body.appendChild(bar);
    setupEdgeBarDrag(bar, settings);
  }
}

function setupEdgeBarDrag(bar, settings) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  bar.addEventListener('mousedown', (event) => {
    if (event.target.tagName === 'INPUT') return;
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    initialLeft = bar.offsetLeft;
    initialTop = bar.offsetTop;
    bar.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;
    const nextLeft = Math.min(Math.max(initialLeft + event.clientX - startX, 0), window.innerWidth - bar.offsetWidth);
    const nextTop = Math.min(Math.max(initialTop + event.clientY - startY, 0), window.innerHeight - bar.offsetHeight);
    bar.style.left = `${nextLeft}px`;
    bar.style.top = `${nextTop}px`;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    bar.style.cursor = 'grab';
    settings.left = bar.offsetLeft;
    settings.top = bar.offsetTop;
    saveEdgeBarSettings(settings);
  });

  window.addEventListener('resize', () => {
    const nextSettings = normalizeEdgeBarSettings({
      ...settings,
      left: bar.offsetLeft,
      top: bar.offsetTop
    });
    saveEdgeBarSettings(nextSettings);
    loadEdgeReminderBar();
  });
}

function loadPageNotes() {
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const pageNotes = notes.filter((note) => note.url === currentUrl);
    pageNotes.forEach((note) => renderNote(normalizeNote(note)));
  });
}

function normalizeNote(note) {
  return {
    ...note,
    status: note.status || DEFAULT_NOTE_STATUS,
    tabId: note.tabId || DEFAULT_TAB_ID,
    edgeReminder: Boolean(note.edgeReminder),
    minimized: Boolean(note.minimized),
    minimizedX: Number.isFinite(note.minimizedX) ? note.minimizedX : 12,
    minimizedY: Number.isFinite(note.minimizedY) ? note.minimizedY : 12
  };
}

function createNoteData(targetUrl) {
  chrome.storage.sync.get(['boardSettings'], (result) => {
    const tabs = result.boardSettings?.tabs || [];
    const activeTab = tabs.find((tab) => tab.id === result.boardSettings?.activeTabId) || tabs[0];
    const firstTab = activeTab?.id || DEFAULT_TAB_ID;
    const firstStatus = activeTab?.statuses?.[0]?.id || result.boardSettings?.statuses?.[0]?.id || DEFAULT_NOTE_STATUS;
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
      status: firstStatus,
      tabId: firstTab,
      edgeReminder: false,
      minimized: false,
      minimizedX: 12,
      minimizedY: 12
    };
    saveNoteToStorage(newNote);
    renderNote(newNote);
  });
}

function saveNoteToStorage(noteData) {
  lastLocalSaveAt = Date.now();
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const index = notes.findIndex((note) => note.id === noteData.id);
    const normalizedNote = normalizeNote(noteData);
    if (index > -1) {
      notes[index] = { ...normalizedNote };
    } else {
      notes.push({ ...normalizedNote });
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

function getNoteSummary(data) {
  const summary = (data.content || '').trim().replace(/\s+/g, ' ');
  return summary ? summary.slice(0, 24) : 'Empty note';
}

function openSafeUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderNote(noteData) {
  const data = normalizeNote(noteData);
  if (document.getElementById(data.id)) return;

  if (data.minimized) {
    renderMinimizedNote(data);
  } else {
    renderExpandedNote(data);
  }
}

function renderMinimizedNote(data) {
  let isDeleted = false;
  const card = document.createElement('div');
  card.className = 'sticky-note-card sticky-note-minimized';
  card.id = data.id;
  card.style.left = `${data.minimizedX}px`;
  card.style.top = `${data.minimizedY}px`;
  card.style.backgroundColor = data.color;
  card.style.position = 'fixed';
  card.style.zIndex = data.zIndex || 10000;
  card.title = 'Drag to move. Double-click to restore.';

  const summary = document.createElement('span');
  summary.className = 'minimized-note-summary';
  summary.innerText = getNoteSummary(data);

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button';
  restoreBtn.className = 'note-icon-btn';
  restoreBtn.innerText = '+';
  restoreBtn.title = 'Restore note';
  restoreBtn.onclick = (event) => {
    event.stopPropagation();
    isDeleted = true;
    data.minimized = false;
    card.remove();
    saveNoteToStorage(data);
    renderExpandedNote(data);
  };

  card.appendChild(summary);
  card.appendChild(restoreBtn);
  document.body.appendChild(card);

  setupMinimizedNoteDrag(card, data, () => isDeleted);

  card.ondblclick = () => {
    if (isDeleted) return;
    isDeleted = true;
    data.minimized = false;
    card.remove();
    saveNoteToStorage(data);
    renderExpandedNote(data);
  };

  card.cleanupNote = () => {
    isDeleted = true;
  };
}

function setupMinimizedNoteDrag(card, data, getIsDeleted) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  card.addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) return;
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    initialLeft = card.offsetLeft;
    initialTop = card.offsetTop;
    globalMaxZIndex++;
    card.style.zIndex = globalMaxZIndex;
    data.zIndex = globalMaxZIndex;
  });

  window.addEventListener('mousemove', (event) => {
    if (!isDragging || getIsDeleted()) return;
    const position = normalizeFloatingButtonPosition({
      left: initialLeft + event.clientX - startX,
      top: initialTop + event.clientY - startY
    }, { left: 12, top: 12 }, card);
    applyFloatingButtonPosition(card, position);
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging || getIsDeleted()) return;
    isDragging = false;
    data.minimizedX = parseInt(card.style.left, 10);
    data.minimizedY = parseInt(card.style.top, 10);
    saveNoteToStorage(data);
  });
}

function renderExpandedNote(data) {
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

  const minimizeBtn = document.createElement('span');
  minimizeBtn.innerText = '_';
  minimizeBtn.title = 'Minimize note';
  minimizeBtn.className = 'close-btn';
  minimizeBtn.onmousedown = (event) => event.stopPropagation();
  minimizeBtn.onclick = () => {
    isDeleted = true;
    clearInterval(timerInterval);
    if (resizeObserver) resizeObserver.disconnect();
    data.minimized = true;
    data.minimizedX = Number.isFinite(data.minimizedX) ? data.minimizedX : 12;
    data.minimizedY = Number.isFinite(data.minimizedY) ? data.minimizedY : 12;
    card.remove();
    saveNoteToStorage(data);
    renderMinimizedNote(data);
  };

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

  const rightControls = document.createElement('div');
  rightControls.style.display = 'flex';
  rightControls.appendChild(minimizeBtn);
  rightControls.appendChild(closeBtn);

  header.appendChild(leftControls);
  header.appendChild(rightControls);

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
