const SAVE_DEBOUNCE_MS = 300;
const LOCAL_SAVE_IGNORE_MS = 500;
const DEFAULT_TAB_ID = 'default';
const DEFAULT_NOTE_STATUS = 'discussion';
const DEFAULT_COLUMN_WIDTH = 24;
const DEFAULT_COLUMN_HEIGHT = 520;
const APP_SETTINGS_KEY = 'appSettings';
const LOCAL_EXPORT_KEYS = [
  'customBgImage',
  'customBgImageUpdatedAt',
  'floatingButtonPosition',
  'edgeReminderBarSettings'
];
const DEFAULT_STATUSES = [
  { id: 'discussion', label: 'Discussion', color: '#c98219', width: DEFAULT_COLUMN_WIDTH, height: DEFAULT_COLUMN_HEIGHT },
  { id: 'waiting', label: 'WAITING', color: '#a33a2f', width: DEFAULT_COLUMN_WIDTH, height: DEFAULT_COLUMN_HEIGHT },
  { id: 'doing', label: 'DOING', color: '#0f766e', width: DEFAULT_COLUMN_WIDTH, height: DEFAULT_COLUMN_HEIGHT },
  { id: 'done', label: 'DONE', color: '#687a3d', width: DEFAULT_COLUMN_WIDTH, height: DEFAULT_COLUMN_HEIGHT }
];
const DEFAULT_TABS = [
  { id: DEFAULT_TAB_ID, label: 'Default', statuses: DEFAULT_STATUSES.map((status) => ({ ...status })) }
];

let lastLocalSaveAt = 0;
let boardSettings = getDefaultBoardSettings();
let currentNotes = [];

function getTimestamp() {
  return new Date().toISOString();
}

function getTimeValue(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

window.addEventListener('load', () => {
  loadDashboardData();
  loadBackgroundSettings();
  setupSettingsUI();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;

  if (changes.notes || changes.boardSettings) {
    if (Date.now() - lastLocalSaveAt < LOCAL_SAVE_IGNORE_MS) return;
    loadDashboardData();
  }

  if (changes.globalSettings) {
    chrome.storage.local.get(['customBgImage'], (localRes) => {
      if (!localRes.customBgImage) {
        applyBackground(changes.globalSettings.newValue?.bgUrl);
      }
    });
  }
});

function getDefaultBoardSettings() {
  return {
    tabs: DEFAULT_TABS.map((tab) => ({ ...tab })),
    activeTabId: DEFAULT_TAB_ID,
    updatedAt: ''
  };
}

function normalizeAppSettings(settings) {
  return {
    addButtonEnabled: settings?.addButtonEnabled !== false,
    charactersEnabled: settings?.charactersEnabled !== false,
    characterCount: normalizeCharacterCount(settings?.characterCount),
    updatedAt: settings?.updatedAt || ''
  };
}

function normalizeCharacterCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.round(count), 1), 5);
}

function normalizeBoardSettings(settings) {
  const fallback = getDefaultBoardSettings();
  const legacyStatuses = Array.isArray(settings?.statuses) && settings.statuses.length
    ? settings.statuses
    : DEFAULT_STATUSES;
  const tabs = Array.isArray(settings?.tabs) && settings.tabs.length
    ? settings.tabs
    : fallback.tabs;

  const normalizedTabs = tabs.map((tab, index) => ({
    id: String(tab.id || createId('tab')),
    label: String(tab.label || `Tab ${index + 1}`),
    statuses: normalizeStatuses(Array.isArray(tab.statuses) ? tab.statuses : legacyStatuses)
  }));
  const activeTabId = normalizedTabs.some((tab) => tab.id === settings?.activeTabId)
    ? settings.activeTabId
    : normalizedTabs[0].id;

  return {
    tabs: normalizedTabs,
    activeTabId,
    updatedAt: settings?.updatedAt || ''
  };
}

function normalizeStatuses(statuses) {
  const sourceStatuses = Array.isArray(statuses) ? statuses : DEFAULT_STATUSES;
  return sourceStatuses.map((status, index) => ({
    id: String(status.id || createId('status')),
    label: typeof status.label === 'string' ? status.label : `Status ${index + 1}`,
    color: isHexColor(status.color) ? status.color : DEFAULT_STATUSES[index % DEFAULT_STATUSES.length].color,
    width: normalizeColumnWidth(status.width),
    height: Number.isFinite(status.height) && status.height > 0 ? status.height : DEFAULT_COLUMN_HEIGHT
  }));
}

function normalizeColumnWidth(width) {
  if (!Number.isFinite(width) || width <= 0) return DEFAULT_COLUMN_WIDTH;
  return width <= 2 ? DEFAULT_COLUMN_WIDTH : width;
}

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadDashboardData() {
  chrome.storage.sync.get(['notes', 'boardSettings'], (result) => {
    boardSettings = normalizeBoardSettings(result.boardSettings);
    currentNotes = (result.notes || []).map(normalizeNote);
    const migratedNotes = migrateNotesToSettings(currentNotes);
    const needsSettingsSave = JSON.stringify(boardSettings) !== JSON.stringify(result.boardSettings || {});
    const needsNotesSave = JSON.stringify(migratedNotes) !== JSON.stringify(result.notes || []);
    currentNotes = migratedNotes;
    renderDashboard();

    if (needsSettingsSave || needsNotesSave) {
      lastLocalSaveAt = Date.now();
      chrome.storage.sync.set({
        boardSettings,
        notes: currentNotes
      });
    }
  });
}

function migrateNotesToSettings(notes) {
  const firstTab = boardSettings.tabs[0].id;
  return notes.map((note) => {
    const tabExists = boardSettings.tabs.some((tab) => tab.id === note.tabId);
    const nextTabId = tabExists ? note.tabId : firstTab;
    const tabStatuses = getStatusesForTab(nextTabId);
    const firstStatus = tabStatuses[0]?.id || '';
    const statusExists = tabStatuses.some((status) => status.id === note.status);
    return {
      ...note,
      status: statusExists || !firstStatus ? note.status : firstStatus,
      tabId: nextTabId
    };
  });
}

function normalizeNote(note) {
  return {
    ...note,
    status: note.status || DEFAULT_NOTE_STATUS,
    tabId: note.tabId || DEFAULT_TAB_ID,
    edgeReminder: Boolean(note.edgeReminder)
  };
}

function renderDashboard() {
  renderTabBar();
  renderBoardSettingsPanel();
  renderTodoBoard();
}

function getActiveTab() {
  return boardSettings.tabs.find((tab) => tab.id === boardSettings.activeTabId) || boardSettings.tabs[0];
}

function getActiveStatuses() {
  return getActiveTab().statuses;
}

function getStatusesForTab(tabId) {
  const statuses = boardSettings.tabs.find((tab) => tab.id === tabId)?.statuses;
  return Array.isArray(statuses) ? statuses : getActiveStatuses();
}

function renderTabBar() {
  const tabBar = document.getElementById('tab-bar');
  tabBar.innerHTML = '';
  boardSettings.tabs.forEach((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tab-btn${tab.id === boardSettings.activeTabId ? ' active' : ''}`;
    button.innerText = tab.label;
    button.onclick = () => {
      boardSettings.activeTabId = tab.id;
      saveBoardSettings(renderDashboard);
    };
    tabBar.appendChild(button);
  });
}

function renderBoardSettingsPanel() {
  renderTabEditor();
  renderStatusEditor();
}

function renderTabEditor() {
  const container = document.getElementById('tab-settings-list');
  container.innerHTML = '';
  boardSettings.tabs.forEach((tab) => {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = tab.label;
    input.className = 'settings-text';
    input.onchange = () => {
      tab.label = input.value.trim() || tab.label;
      saveBoardSettings(renderDashboard);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'settings-mini-btn';
    deleteBtn.innerText = 'Del';
    deleteBtn.disabled = boardSettings.tabs.length <= 1;
    deleteBtn.onclick = () => removeTab(tab.id);

    row.appendChild(input);
    row.appendChild(deleteBtn);
    container.appendChild(row);
  });
}

function renderStatusEditor() {
  const container = document.getElementById('status-settings-list');
  container.innerHTML = '';
  getActiveStatuses().forEach((status) => {
    const row = document.createElement('div');
    row.className = 'settings-row status-row';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = status.color;
    color.className = 'settings-color';
    color.oninput = () => {
      status.color = color.value;
      saveBoardSettings(renderDashboard);
    };

    const input = document.createElement('input');
    input.type = 'text';
    input.value = status.label;
    input.className = 'settings-text';
    input.onchange = () => {
      status.label = input.value.trim() || status.label;
      saveBoardSettings(renderDashboard);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'settings-mini-btn';
    deleteBtn.innerText = 'Del';
    deleteBtn.disabled = getActiveStatuses().length <= 1;
    deleteBtn.onclick = () => removeStatus(status.id);

    row.appendChild(color);
    row.appendChild(input);
    row.appendChild(deleteBtn);
    container.appendChild(row);
  });
}

function renderTodoBoard() {
  const board = document.getElementById('todo-board');
  board.innerHTML = '';

  if (!getActiveStatuses().length) {
    const emptyState = document.createElement('div');
    emptyState.className = 'board-empty-state';
    emptyState.innerText = 'Add a status to start this tab.';
    board.appendChild(emptyState);
    return;
  }

  getActiveStatuses().forEach((status) => {
    const column = document.createElement('section');
    column.className = 'todo-column';
    column.dataset.status = status.id;
    column.style.borderTopColor = status.color;
    column.style.flexBasis = `calc(${status.width}% - 12px)`;
    column.style.height = `${status.height}px`;

    const header = document.createElement('div');
    header.className = 'todo-column-header';

    const label = document.createElement('span');
    label.innerText = status.label;

    const count = document.createElement('span');
    count.className = 'todo-count';
    const statusNotes = getActiveTabNotes().filter((note) => note.status === status.id);
    count.innerText = String(statusNotes.length);

    header.appendChild(label);
    header.appendChild(count);

    const list = document.createElement('div');
    list.className = 'todo-list';
    list.dataset.list = status.id;
    statusNotes.forEach((note) => list.appendChild(renderTodoCard(note)));
    setupListDrop(list);

    column.appendChild(header);
    column.appendChild(list);
    column.appendChild(renderColumnResizeHandle(column, status));
    board.appendChild(column);
  });
}

function getActiveTabNotes() {
  return currentNotes.filter((note) => note.tabId === boardSettings.activeTabId);
}

function renderColumnResizeHandle(column, status) {
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'column-resize-handle';
  handle.title = 'Resize column';

  handle.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = status.width;
    const startHeight = status.height;
    const boardWidth = document.getElementById('todo-board').offsetWidth || 1;

    const onMove = (moveEvent) => {
      const widthDelta = ((moveEvent.clientX - startX) / boardWidth) * 100;
      const heightDelta = moveEvent.clientY - startY;
      status.width = Math.min(Math.max(startWidth + widthDelta, 16), 100);
      status.height = Math.min(Math.max(startHeight + heightDelta, 220), 1200);
      column.style.flexBasis = `calc(${status.width}% - 12px)`;
      column.style.height = `${status.height}px`;
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      saveBoardSettings();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  return handle;
}

function setupListDrop(list) {
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
    updateNote(noteId, (note) => ({ ...note, status: nextStatus }), loadDashboardData);
  });
}

function addTab() {
  const tab = {
    id: createId('tab'),
    label: 'New Tab',
    statuses: []
  };
  boardSettings.tabs.push(tab);
  boardSettings.activeTabId = tab.id;
  saveBoardSettings(renderDashboard);
}

function removeTab(tabId) {
  if (boardSettings.tabs.length <= 1) return;
  const fallbackTab = boardSettings.tabs.find((tab) => tab.id !== tabId);
  boardSettings.tabs = boardSettings.tabs.filter((tab) => tab.id !== tabId);
  if (boardSettings.activeTabId === tabId) boardSettings.activeTabId = fallbackTab.id;
  currentNotes = currentNotes.map((note) => (
    note.tabId === tabId ? { ...note, tabId: fallbackTab.id } : note
  ));
  saveAllData(renderDashboard);
}

function addStatus() {
  const status = {
    id: createId('status'),
    label: '',
    color: '#3b82f6',
    width: DEFAULT_COLUMN_WIDTH,
    height: DEFAULT_COLUMN_HEIGHT
  };
  getActiveStatuses().push(status);
  saveBoardSettings(renderDashboard);
}

function removeStatus(statusId) {
  const activeTab = getActiveTab();
  if (activeTab.statuses.length <= 1) return;
  const fallbackStatus = activeTab.statuses.find((status) => status.id !== statusId);
  activeTab.statuses = activeTab.statuses.filter((status) => status.id !== statusId);
  currentNotes = currentNotes.map((note) => (
    note.tabId === activeTab.id && note.status === statusId ? { ...note, status: fallbackStatus.id } : note
  ));
  saveAllData(renderDashboard);
}

function createNoteData(targetUrl) {
  const activeStatuses = getActiveStatuses();
  if (!activeStatuses.length) {
    alert('Please add a status before creating a note.');
    return;
  }
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
    status: activeStatuses[0].id,
    tabId: boardSettings.activeTabId,
    edgeReminder: false,
    minimized: false,
    minimizedX: 12,
    minimizedY: 12,
    updatedAt: getTimestamp()
  };
  saveNoteToStorage(newNote, loadDashboardData);
}

function saveBoardSettings(afterSave) {
  lastLocalSaveAt = Date.now();
  boardSettings.updatedAt = getTimestamp();
  chrome.storage.sync.set({ boardSettings }, () => {
    if (typeof afterSave === 'function') afterSave();
  });
}

function saveAllData(afterSave) {
  lastLocalSaveAt = Date.now();
  boardSettings.updatedAt = getTimestamp();
  chrome.storage.sync.set({ boardSettings, notes: currentNotes }, () => {
    if (typeof afterSave === 'function') afterSave();
  });
}

function saveNoteToStorage(noteData, afterSave) {
  lastLocalSaveAt = Date.now();
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = (result.notes || []).map(normalizeNote);
    const normalizedNote = normalizeNote(noteData);
    normalizedNote.updatedAt = getTimestamp();
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
    const notes = (result.notes || []).map(normalizeNote);
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

function renderTodoCard(note) {
  const card = document.createElement('article');
  card.className = 'todo-card';
  card.draggable = true;
  card.style.backgroundColor = note.color;

  card.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', note.id);
    event.dataTransfer.effectAllowed = 'move';
  });

  const cardHeader = document.createElement('div');
  cardHeader.className = 'todo-card-header';
  cardHeader.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  const reminderBtn = document.createElement('button');
  reminderBtn.type = 'button';
  reminderBtn.className = `todo-reminder-btn${note.reminder ? ' active' : ''}`;
  reminderBtn.innerText = note.reminder ? 'A!' : 'A';
  reminderBtn.title = note.reminder ? `Reminder: ${getCountdownText(note.reminder) || note.reminder}` : 'Set reminder';

  const reminderPanel = document.createElement('div');
  reminderPanel.className = 'todo-reminder-panel';
  reminderPanel.hidden = true;

  const reminderInput = document.createElement('input');
  reminderInput.type = 'datetime-local';
  reminderInput.className = 'todo-reminder';
  reminderInput.title = 'Reminder time';
  reminderInput.value = note.reminder || '';

  const reminderText = document.createElement('div');
  reminderText.className = 'todo-reminder-text';
  reminderText.innerText = getCountdownText(note.reminder);

  const clearReminderBtn = document.createElement('button');
  clearReminderBtn.type = 'button';
  clearReminderBtn.className = 'todo-action-btn';
  clearReminderBtn.innerText = 'Clear';
  clearReminderBtn.disabled = !note.reminder;

  const updateReminderState = () => {
    const text = getCountdownText(note.reminder);
    reminderText.innerText = text;
    reminderBtn.classList.toggle('active', Boolean(note.reminder));
    reminderBtn.innerText = note.reminder ? 'A!' : 'A';
    reminderBtn.title = note.reminder ? `Reminder: ${text || note.reminder}` : 'Set reminder';
    clearReminderBtn.disabled = !note.reminder;
  };

  reminderBtn.onclick = (event) => {
    event.stopPropagation();
    reminderPanel.hidden = !reminderPanel.hidden;
  };

  reminderInput.onchange = () => {
    note.reminder = reminderInput.value;
    saveNoteToStorage(note);
    updateReminderState();

    if (note.reminder) {
      scheduleReminder(note);
    } else {
      clearReminder(note.id);
    }
  };

  clearReminderBtn.onclick = () => {
    note.reminder = '';
    reminderInput.value = '';
    saveNoteToStorage(note);
    clearReminder(note.id);
    updateReminderState();
  };

  reminderPanel.appendChild(reminderInput);
  reminderPanel.appendChild(clearReminderBtn);
  reminderPanel.appendChild(reminderText);
  cardHeader.appendChild(reminderBtn);
  cardHeader.appendChild(reminderPanel);

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
    saveNoteToStorage(note, loadDashboardData);
  });

  const meta = document.createElement('div');
  meta.className = 'todo-meta';
  meta.innerText = note.url === 'dashboard' ? 'Dashboard note' : note.url;

  const actions = document.createElement('div');
  actions.className = 'todo-actions';

  const statusSelect = document.createElement('select');
  statusSelect.className = 'todo-status';
  getStatusesForTab(note.tabId).forEach((status) => {
    const option = document.createElement('option');
    option.value = status.id;
    option.innerText = status.label;
    option.selected = note.status === status.id;
    statusSelect.appendChild(option);
  });
  statusSelect.onchange = () => {
    note.status = statusSelect.value;
    saveNoteToStorage(note, loadDashboardData);
  };

  const tabSelect = document.createElement('select');
  tabSelect.className = 'todo-status';
  boardSettings.tabs.forEach((tab) => {
    const option = document.createElement('option');
    option.value = tab.id;
    option.innerText = tab.label;
    option.selected = note.tabId === tab.id;
    tabSelect.appendChild(option);
  });
  tabSelect.onchange = () => {
    note.tabId = tabSelect.value;
    note.status = getStatusesForTab(note.tabId)[0].id;
    saveNoteToStorage(note, loadDashboardData);
  };

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'todo-color';
  colorInput.value = note.color;
  colorInput.title = 'Card color';
  colorInput.oninput = () => {
    note.color = colorInput.value;
    card.style.backgroundColor = note.color;
    saveNoteToStorage(note);
  };

  const edgeLabel = document.createElement('label');
  edgeLabel.className = 'todo-toggle';
  const edgeInput = document.createElement('input');
  edgeInput.type = 'checkbox';
  edgeInput.checked = note.edgeReminder;
  edgeInput.onchange = () => {
    note.edgeReminder = edgeInput.checked;
    saveNoteToStorage(note);
  };
  edgeLabel.appendChild(edgeInput);
  edgeLabel.appendChild(document.createTextNode('Edge'));

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
    deleteNoteFromStorage(note.id, loadDashboardData);
  };

  actions.appendChild(statusSelect);
  actions.appendChild(tabSelect);
  actions.appendChild(colorInput);
  actions.appendChild(edgeLabel);
  actions.appendChild(openBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(cardHeader);
  card.appendChild(content);
  card.appendChild(meta);
  card.appendChild(actions);
  return card;
}

function exportAllData() {
  chrome.storage.sync.get(['notes', 'boardSettings', 'globalSettings', APP_SETTINGS_KEY], (syncData) => {
    chrome.storage.local.get(LOCAL_EXPORT_KEYS, (localData) => {
      const payload = {
        schemaVersion: 1,
        exportedAt: getTimestamp(),
        extensionVersion: chrome.runtime.getManifest().version,
        sync: {
          notes: syncData.notes || [],
          boardSettings: syncData.boardSettings || null,
          globalSettings: syncData.globalSettings || null,
          appSettings: normalizeAppSettings(syncData[APP_SETTINGS_KEY])
        },
        local: {
          customBgImage: localData.customBgImage || null,
          customBgImageUpdatedAt: localData.customBgImageUpdatedAt || '',
          floatingButtonPosition: localData.floatingButtonPosition || null,
          edgeReminderBarSettings: localData.edgeReminderBarSettings || null
        }
      };
      downloadJson(payload);
    });
  });
}

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `syncsticky-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importAllData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.target.result);
    } catch (error) {
      alert('Invalid import file.');
      return;
    }
    mergeImportedData(payload);
  };
  reader.readAsText(file);
}

function mergeImportedData(payload) {
  const importedSync = payload?.sync || {};
  const importedLocal = payload?.local || {};

  chrome.storage.sync.get(['notes', 'boardSettings', 'globalSettings', APP_SETTINGS_KEY], (currentSync) => {
    const nextNotes = mergeNotesByUpdatedAt(currentSync.notes || [], importedSync.notes || []);
    const nextBoardSettings = pickNewerObject(importedSync.boardSettings, currentSync.boardSettings);
    const nextGlobalSettings = pickNewerObject(importedSync.globalSettings, currentSync.globalSettings);
    const nextAppSettings = pickNewerObject(
      importedSync.appSettings ? normalizeAppSettings(importedSync.appSettings) : null,
      normalizeAppSettings(currentSync[APP_SETTINGS_KEY])
    );

    const syncUpdate = {
      notes: nextNotes,
      boardSettings: nextBoardSettings || currentSync.boardSettings,
      [APP_SETTINGS_KEY]: nextAppSettings
    };
    if (nextGlobalSettings) syncUpdate.globalSettings = nextGlobalSettings;

    chrome.storage.sync.set(syncUpdate, () => {
      mergeImportedLocalData(importedLocal, () => {
        loadDashboardData();
        loadBackgroundSettings();
        alert('Import complete.');
      });
    });
  });
}

function mergeNotesByUpdatedAt(currentNotesInput, importedNotesInput) {
  const notesById = new Map();
  currentNotesInput.forEach((note) => {
    if (note.id) notesById.set(note.id, note);
  });
  importedNotesInput.forEach((note) => {
    if (!note.id) return;
    const current = notesById.get(note.id);
    if (!current || getTimeValue(note.updatedAt) > getTimeValue(current.updatedAt)) {
      notesById.set(note.id, note);
    }
  });
  return Array.from(notesById.values());
}

function pickNewerObject(importedObject, currentObject) {
  if (!importedObject) return currentObject || null;
  if (!currentObject) return importedObject;
  return getTimeValue(importedObject.updatedAt) > getTimeValue(currentObject.updatedAt)
    ? importedObject
    : currentObject;
}

function mergeImportedLocalData(importedLocal, afterMerge) {
  chrome.storage.local.get(LOCAL_EXPORT_KEYS, (currentLocal) => {
    const localUpdate = {};

    if (importedLocal.customBgImage && getTimeValue(importedLocal.customBgImageUpdatedAt) > getTimeValue(currentLocal.customBgImageUpdatedAt)) {
      localUpdate.customBgImage = importedLocal.customBgImage;
      localUpdate.customBgImageUpdatedAt = importedLocal.customBgImageUpdatedAt || getTimestamp();
    }

    ['floatingButtonPosition', 'edgeReminderBarSettings'].forEach((key) => {
      const nextValue = pickNewerObject(importedLocal[key], currentLocal[key]);
      if (nextValue) localUpdate[key] = nextValue;
    });

    if (Object.keys(localUpdate).length) {
      chrome.storage.local.set(localUpdate, afterMerge);
      return;
    }
    afterMerge();
  });
}

function setupSettingsUI() {
  const modal = document.getElementById('settings-modal');
  const overlay = document.getElementById('modal-overlay');
  const btnSettings = document.getElementById('fab-settings');
  const btnAddNote = document.getElementById('btn-add-note');
  const btnToggleSettings = document.getElementById('btn-board-settings');
  const btnAddTab = document.getElementById('btn-add-tab');
  const btnAddStatus = document.getElementById('btn-add-status');
  const btnSaveUrl = document.getElementById('btn-save-bg');
  const btnClear = document.getElementById('btn-clear-bg');
  const btnClose = document.getElementById('btn-close-bg');
  const btnExport = document.getElementById('btn-export-data');
  const btnImport = document.getElementById('btn-import-data');
  const inputUrl = document.getElementById('bg-url-input');
  const inputFile = document.getElementById('bg-file-input');
  const inputImport = document.getElementById('import-file-input');
  const inputAddButtonEnabled = document.getElementById('add-button-enabled-input');
  const inputCharacterEnabled = document.getElementById('character-enabled-input');
  const inputCharacterCount = document.getElementById('character-count-input');
  const settingsPanel = document.getElementById('board-settings-panel');

  btnAddNote.onclick = () => {
    createNoteData('dashboard');
  };

  btnToggleSettings.onclick = () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  };

  btnAddTab.onclick = addTab;
  btnAddStatus.onclick = addStatus;

  btnSettings.onclick = () => {
    modal.style.display = 'block';
    overlay.style.display = 'block';
    chrome.storage.sync.get(['globalSettings', APP_SETTINGS_KEY], (res) => {
      const appSettings = normalizeAppSettings(res[APP_SETTINGS_KEY]);
      inputUrl.value = res.globalSettings?.bgUrl || '';
      inputAddButtonEnabled.checked = appSettings.addButtonEnabled;
      inputCharacterEnabled.checked = appSettings.charactersEnabled;
      inputCharacterCount.value = String(appSettings.characterCount);
    });
    inputFile.value = '';
    inputImport.value = '';
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
      chrome.storage.local.set({
        customBgImage: base64String,
        customBgImageUpdatedAt: getTimestamp()
      }, () => {
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
      chrome.storage.sync.set({ globalSettings: { bgUrl: url, updatedAt: getTimestamp() } });
      applyBackground(url);
      closeModal();
    });
  };

  btnClear.onclick = () => {
    chrome.storage.local.remove(['customBgImage', 'customBgImageUpdatedAt']);
    chrome.storage.sync.remove(['globalSettings']);
    applyBackground(null);
    closeModal();
  };

  inputAddButtonEnabled.onchange = () => {
    chrome.storage.sync.set({
      [APP_SETTINGS_KEY]: {
        addButtonEnabled: inputAddButtonEnabled.checked,
        charactersEnabled: inputCharacterEnabled.checked,
        characterCount: normalizeCharacterCount(inputCharacterCount.value),
        updatedAt: getTimestamp()
      }
    });
  };

  const saveCharacterSettings = () => {
    chrome.storage.sync.set({
      [APP_SETTINGS_KEY]: {
        addButtonEnabled: inputAddButtonEnabled.checked,
        charactersEnabled: inputCharacterEnabled.checked,
        characterCount: normalizeCharacterCount(inputCharacterCount.value),
        updatedAt: getTimestamp()
      }
    });
  };

  inputCharacterEnabled.onchange = saveCharacterSettings;
  inputCharacterCount.onchange = saveCharacterSettings;

  btnExport.onclick = exportAllData;

  btnImport.onclick = () => {
    inputImport.click();
  };

  inputImport.onchange = () => {
    importAllData(inputImport.files[0]);
    inputImport.value = '';
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
