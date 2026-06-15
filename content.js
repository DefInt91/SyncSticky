let globalMaxZIndex = 2147483647;
const currentUrl = window.location.hostname + window.location.pathname;
const SAVE_DEBOUNCE_MS = 300;
const LOCAL_SAVE_IGNORE_MS = 500;
const FLOATING_BUTTON_POSITION_KEY = 'floatingButtonPosition';
const EDGE_BAR_SETTINGS_KEY = 'edgeReminderBarSettings';
const EDGE_BAR_ID = 'syncsticky-edge-reminder-bar';
const APP_SETTINGS_KEY = 'appSettings';
const NOTE_HTML_MAP_KEY = 'noteContentHtml';
const CHARACTER_LAYER_ID = 'syncsticky-character-layer';
const CHARACTER_LIST_PATH = 'Character/characters.json';
const DEFAULT_CHARACTER_ASSETS = ['Character/cat_1.png'];
const DEFAULT_TAB_ID = 'default';
const DEFAULT_NOTE_STATUS = 'discussion';
let lastLocalSaveAt = 0;
let characterAnimationId = 0;
let characterAssetsCache = null;

window.addEventListener('load', () => {
  refreshFloatingButton();
  loadPageNotes();
  loadEdgeReminderBar();
  refreshCharacters();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.notes) {
    if (Date.now() - lastLocalSaveAt >= LOCAL_SAVE_IGNORE_MS) {
      removeAllRenderedNotes();
      loadPageNotes();
    }
    loadEdgeReminderBar();
    refreshCharacters();
  }

  if (area === 'sync' && changes.boardSettings) {
    loadEdgeReminderBar();
  }

  if (area === 'sync' && changes.appSettings) {
    refreshFloatingButton();
    refreshCharacters();
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

function getTimestamp() {
  return new Date().toISOString();
}

function refreshFloatingButton() {
  chrome.storage.sync.get([APP_SETTINGS_KEY], (result) => {
    const settings = normalizeAppSettings(result[APP_SETTINGS_KEY]);
    const existing = document.getElementById('syncsticky-add-button');
    if (!settings.addButtonEnabled) {
      if (existing) existing.remove();
      return;
    }
    createFloatingButton();
  });
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
    const position = restoreSnappedPosition(savedPosition, defaultPosition, btn);
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

    const position = getSnappedPosition({
      left: btn.offsetLeft,
      top: btn.offsetTop
    }, btn);
    applyFloatingButtonPosition(btn, position);
    position.updatedAt = getTimestamp();
    chrome.storage.local.set({ [FLOATING_BUTTON_POSITION_KEY]: position });

    if (!wasDragged) {
      createNoteData(currentUrl);
    }
  });

  window.addEventListener('resize', () => {
    const position = restoreSnappedPosition({
      left: btn.offsetLeft,
      top: btn.offsetTop,
      edge: resultEdgeFromElement(btn)
    }, defaultPosition, btn);
    position.updatedAt = getTimestamp();
    applyFloatingButtonPosition(btn, position);
    chrome.storage.local.set({ [FLOATING_BUTTON_POSITION_KEY]: position });
  });
}

function resultEdgeFromElement(element) {
  return getSnappedPosition({
    left: element.offsetLeft,
    top: element.offsetTop
  }, element).edge;
}

function getDefaultFloatingButtonPosition(btn) {
  return {
    left: window.innerWidth - btn.offsetWidth,
    top: window.innerHeight - btn.offsetHeight
  };
}

function normalizeFloatingButtonPosition(position, fallbackPosition, element) {
  const rawLeft = Number.isFinite(position?.left) ? position.left : fallbackPosition.left;
  const rawTop = Number.isFinite(position?.top) ? position.top : fallbackPosition.top;
  const elementWidth = getElementDimension(element, 'width');
  const elementHeight = getElementDimension(element, 'height');
  return {
    left: Math.min(Math.max(rawLeft, 0), Math.max(window.innerWidth - elementWidth, 0)),
    top: Math.min(Math.max(rawTop, 0), Math.max(window.innerHeight - elementHeight, 0))
  };
}

function getElementDimension(element, property) {
  const offsetValue = property === 'width' ? element.offsetWidth : element.offsetHeight;
  if (offsetValue > 0) return offsetValue;
  const styleValue = parseInt(element.style[property], 10);
  return Number.isFinite(styleValue) && styleValue > 0 ? styleValue : 0;
}

function getSnappedPosition(position, element) {
  const normalized = normalizeFloatingButtonPosition(position, position, element);
  const maxLeft = Math.max(window.innerWidth - getElementDimension(element, 'width'), 0);
  const maxTop = Math.max(window.innerHeight - getElementDimension(element, 'height'), 0);
  const distances = [
    { edge: 'left', value: normalized.left },
    { edge: 'right', value: maxLeft - normalized.left },
    { edge: 'top', value: normalized.top },
    { edge: 'bottom', value: maxTop - normalized.top }
  ];
  const nearest = distances.reduce((closest, item) => (
    item.value < closest.value ? item : closest
  ), distances[0]);

  if (nearest.edge === 'left') return { ...normalized, left: 0, edge: nearest.edge };
  if (nearest.edge === 'right') return { ...normalized, left: maxLeft, edge: nearest.edge };
  if (nearest.edge === 'top') return { ...normalized, top: 0, edge: nearest.edge };
  return { ...normalized, top: maxTop, edge: nearest.edge };
}

function restoreSnappedPosition(position, fallbackPosition, element) {
  const normalized = normalizeFloatingButtonPosition(position, fallbackPosition, element);
  const maxLeft = Math.max(window.innerWidth - getElementDimension(element, 'width'), 0);
  const maxTop = Math.max(window.innerHeight - getElementDimension(element, 'height'), 0);

  if (position?.edge === 'left') return { ...normalized, left: 0, edge: 'left' };
  if (position?.edge === 'right') return { ...normalized, left: maxLeft, edge: 'right' };
  if (position?.edge === 'top') return { ...normalized, top: 0, edge: 'top' };
  if (position?.edge === 'bottom') return { ...normalized, top: maxTop, edge: 'bottom' };
  return getSnappedPosition(normalized, element);
}

function applyFloatingButtonPosition(element, position) {
  element.style.left = `${position.left}px`;
  element.style.top = `${position.top}px`;
}

function getBoundedFixedPosition(position, element) {
  return normalizeFloatingButtonPosition(position, position, element);
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
      if (!status) return;
      const key = `${tab.id}:${status.id}`;
      const existing = groups.get(key) || {
        tabId: tab.id,
        tabLabel: tab.label || 'Default',
        statusId: status.id,
        statusLabel: typeof status.label === 'string' ? status.label : '',
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
    left: Number.isFinite(settings?.left) ? settings.left : window.innerWidth - 50,
    top: Number.isFinite(settings?.top) ? settings.top : 90,
    edge: typeof settings?.edge === 'string' ? settings.edge : 'right',
    opacity: Number.isFinite(settings?.opacity) ? Math.min(Math.max(settings.opacity, 0.2), 1) : 0.82
  };
}

function saveEdgeBarSettings(settings) {
  settings.updatedAt = getTimestamp();
  chrome.storage.local.set({ [EDGE_BAR_SETTINGS_KEY]: settings });
}

function renderEdgeReminderBar(groups, settings) {
  const existing = document.getElementById(EDGE_BAR_ID);
  if (!groups.length) {
    if (existing) existing.remove();
    return;
  }

  const bar = existing || document.createElement('div');
  const position = restoreSnappedPosition(settings, {
    left: window.innerWidth - 50,
    top: 90,
    edge: 'right'
  }, bar);
  bar.id = EDGE_BAR_ID;
  bar.innerHTML = '';
  bar.style.cssText = `
    position: fixed;
    left: ${position.left}px;
    top: ${position.top}px;
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
    const snappedPosition = restoreSnappedPosition(settings, {
      left: window.innerWidth - bar.offsetWidth,
      top: 90,
      edge: 'right'
    }, bar);
    applyFloatingButtonPosition(bar, snappedPosition);
    settings.left = snappedPosition.left;
    settings.top = snappedPosition.top;
    settings.edge = snappedPosition.edge;
    setupEdgeBarDrag(bar, settings);
  }
}

function refreshCharacters() {
  chrome.storage.sync.get([APP_SETTINGS_KEY], (result) => {
    const settings = normalizeAppSettings(result[APP_SETTINGS_KEY]);
    const hasNotes = document.querySelectorAll('.sticky-note-card').length > 0;
    if (!settings.charactersEnabled || !hasNotes) {
      removeCharacters();
      return;
    }
    renderCharacters(settings.characterCount);
  });
}

function removeCharacters() {
  if (characterAnimationId) {
    cancelAnimationFrame(characterAnimationId);
    characterAnimationId = 0;
  }
  const layer = document.getElementById(CHARACTER_LAYER_ID);
  if (layer) layer.remove();
}

function renderCharacters(count) {
  loadCharacterAssets((assets) => {
    let layer = document.getElementById(CHARACTER_LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = CHARACTER_LAYER_ID;
      layer.style.cssText = `
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483645;
        overflow: hidden;
      `;
      document.body.appendChild(layer);
    }

    const currentCount = layer.querySelectorAll('.syncsticky-character').length;
    for (let index = currentCount; index < count; index++) {
      layer.appendChild(createCharacterElement(index, assets));
    }
    Array.from(layer.querySelectorAll('.syncsticky-character'))
      .slice(count)
      .forEach((item) => item.remove());

    if (!characterAnimationId) {
      characterAnimationId = requestAnimationFrame(animateCharacters);
    }
  });
}

function loadCharacterAssets(callback) {
  if (characterAssetsCache) {
    callback(characterAssetsCache);
    return;
  }

  fetch(chrome.runtime.getURL(CHARACTER_LIST_PATH))
    .then((response) => response.ok ? response.json() : DEFAULT_CHARACTER_ASSETS)
    .then((items) => {
      const list = Array.isArray(items) && items.length ? items : DEFAULT_CHARACTER_ASSETS;
      characterAssetsCache = list
        .filter((item) => typeof item === 'string' && item.toLowerCase().endsWith('.png'))
        .map((item) => item.startsWith('Character/') ? item : `Character/${item}`);
      if (!characterAssetsCache.length) characterAssetsCache = DEFAULT_CHARACTER_ASSETS;
      callback(characterAssetsCache);
    })
    .catch(() => {
      characterAssetsCache = DEFAULT_CHARACTER_ASSETS;
      callback(characterAssetsCache);
    });
}

function createCharacterElement(index, assets) {
  const img = document.createElement('img');
  img.className = 'syncsticky-character';
  img.src = chrome.runtime.getURL(assets[index % assets.length]);
  img.alt = '';
  img.style.cssText = `
    position: fixed;
    width: 54px;
    height: 54px;
    object-fit: contain;
    transform-origin: center bottom;
    pointer-events: none;
    user-select: none;
  `;
  img.characterState = {
    x: 40 + index * 72,
    y: Math.max(window.innerHeight - 90, 0),
    vx: index % 2 === 0 ? 0.7 : -0.7,
    vy: 0,
    action: 'walk',
    nextActionAt: performance.now() + 1600 + index * 500
  };
  return img;
}

function animateCharacters(now) {
  const layer = document.getElementById(CHARACTER_LAYER_ID);
  if (!layer) {
    characterAnimationId = 0;
    return;
  }

  const noteRects = getStickyNoteRects();
  layer.querySelectorAll('.syncsticky-character').forEach((character) => {
    updateCharacter(character, noteRects, now);
  });
  characterAnimationId = requestAnimationFrame(animateCharacters);
}

function getStickyNoteRects() {
  return Array.from(document.querySelectorAll('.sticky-note-card'))
    .filter((card) => !card.closest(`#${CHARACTER_LAYER_ID}`))
    .map((card) => card.getBoundingClientRect());
}

function updateCharacter(character, noteRects, now) {
  const state = character.characterState;
  const width = character.offsetWidth || 54;
  const height = character.offsetHeight || 54;

  if (now > state.nextActionAt) {
    const actions = ['walk', 'idle', 'climb'];
    state.action = actions[Math.floor(Math.random() * actions.length)];
    state.nextActionAt = now + 1200 + Math.random() * 2600;
    if (state.action === 'idle') state.vx = 0;
    if (state.action === 'walk') state.vx = Math.random() > 0.5 ? 0.7 : -0.7;
  }

  if (state.action === 'climb' && noteRects.length) {
    const wall = noteRects[Math.floor(Math.random() * noteRects.length)];
    const wallSide = Math.abs(state.x - wall.left) < Math.abs(state.x - wall.right) ? wall.left : wall.right;
    state.x += (wallSide - state.x) * 0.05;
    state.y -= 0.8;
    if (state.y < wall.top) {
      state.action = 'walk';
      state.y = wall.top - height;
      state.vx = Math.random() > 0.5 ? 0.7 : -0.7;
    }
  } else {
    state.vy += 0.24;
    state.x += state.vx;
    state.y += state.vy;
  }

  const floorY = window.innerHeight - height;
  if (state.y > floorY) {
    state.y = floorY;
    state.vy = 0;
  }

  noteRects.forEach((rect) => {
    const overlapsX = state.x + width > rect.left && state.x < rect.right;
    const isFallingOntoTop = state.vy >= 0 && state.y + height >= rect.top && state.y + height <= rect.top + 12;
    if (overlapsX && isFallingOntoTop) {
      state.y = rect.top - height;
      state.vy = 0;
      return;
    }

    const overlapsY = state.y + height > rect.top && state.y < rect.bottom;
    if (overlapsY && state.x + width >= rect.left && state.x <= rect.left && state.vx > 0) {
      state.x = rect.left - width;
      state.vx *= -1;
    }
    if (overlapsY && state.x <= rect.right && state.x + width >= rect.right && state.vx < 0) {
      state.x = rect.right;
      state.vx *= -1;
    }
  });

  if (state.x < 0) {
    state.x = 0;
    state.vx = Math.abs(state.vx || 0.7);
  }
  if (state.x > window.innerWidth - width) {
    state.x = window.innerWidth - width;
    state.vx = -Math.abs(state.vx || 0.7);
  }
  if (state.y < 0) {
    state.y = 0;
    state.vy = 0.4;
  }

  const direction = state.vx < 0 ? -1 : 1;
  const bob = state.action === 'idle' ? Math.sin(now / 300) * 1.4 : Math.sin(now / 120) * 2;
  character.style.transform = `translate(${state.x}px, ${state.y + bob}px) scaleX(${direction})`;
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
    const snappedPosition = getSnappedPosition({
      left: bar.offsetLeft,
      top: bar.offsetTop
    }, bar);
    applyFloatingButtonPosition(bar, snappedPosition);
    settings.left = snappedPosition.left;
    settings.top = snappedPosition.top;
    settings.edge = snappedPosition.edge;
    saveEdgeBarSettings(settings);
  });

  window.addEventListener('resize', () => {
    const nextSettings = restoreSnappedPosition({
      ...settings,
      left: bar.offsetLeft,
      top: bar.offsetTop
    }, {
      left: window.innerWidth - 50,
      top: 90,
      edge: 'right'
    }, bar);
    saveEdgeBarSettings(nextSettings);
    loadEdgeReminderBar();
  });
}

function loadPageNotes() {
  chrome.storage.sync.get(['notes'], (result) => {
    chrome.storage.local.get([NOTE_HTML_MAP_KEY], (localResult) => {
      const notes = mergeNotesWithHtmlMap(result.notes || [], localResult[NOTE_HTML_MAP_KEY]);
      const pageNotes = notes.filter((note) => note.url === currentUrl);
      pageNotes.forEach((note) => renderNote(normalizeNote(note)));
    });
  });
}

function mergeNotesWithHtmlMap(notes, htmlMap) {
  const safeMap = htmlMap || {};
  return notes.map((note) => ({
    ...note,
    contentHtml: safeMap[note.id]?.contentHtml || note.contentHtml || ''
  }));
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
      contentHtml: '',
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
      minimizedY: 12,
      updatedAt: getTimestamp()
    };
    saveNoteToStorage(newNote);
    renderNote(newNote);
  });
}

function saveNoteToStorage(noteData) {
  lastLocalSaveAt = Date.now();
  const normalizedNote = normalizeNote(noteData);
  normalizedNote.updatedAt = getTimestamp();
  saveNoteHtmlToLocal(normalizedNote, () => {
    chrome.storage.sync.get(['notes'], (result) => {
      const notes = result.notes || [];
      const index = notes.findIndex((note) => note.id === normalizedNote.id);
      const syncNote = stripLocalOnlyNoteFields(normalizedNote);
      if (index > -1) {
        notes[index] = { ...syncNote };
      } else {
        notes.push({ ...syncNote });
      }
      chrome.storage.sync.set({ notes });
    });
  });
}

function stripLocalOnlyNoteFields(note) {
  const { contentHtml, ...syncNote } = note;
  return syncNote;
}

function saveNoteHtmlToLocal(note, afterSave) {
  chrome.storage.local.get([NOTE_HTML_MAP_KEY], (result) => {
    const htmlMap = result[NOTE_HTML_MAP_KEY] || {};
    if (note.contentHtml) {
      htmlMap[note.id] = {
        contentHtml: note.contentHtml,
        updatedAt: note.updatedAt
      };
    } else {
      delete htmlMap[note.id];
    }
    chrome.storage.local.set({ [NOTE_HTML_MAP_KEY]: htmlMap }, afterSave);
  });
}

function deleteNoteFromStorage(id) {
  lastLocalSaveAt = Date.now();
  clearReminder(id);
  removeNoteHtmlFromLocal(id);
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

function removeNoteHtmlFromLocal(id) {
  chrome.storage.local.get([NOTE_HTML_MAP_KEY], (result) => {
    const htmlMap = result[NOTE_HTML_MAP_KEY] || {};
    delete htmlMap[id];
    chrome.storage.local.set({ [NOTE_HTML_MAP_KEY]: htmlMap });
  });
}

function getNoteHtml(data) {
  if (data.contentHtml) return data.contentHtml;
  return linkify(data.content);
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
  const initialPosition = getBoundedFixedPosition({
    left: data.minimizedX,
    top: data.minimizedY
  }, card);
  card.style.left = `${initialPosition.left}px`;
  card.style.top = `${initialPosition.top}px`;
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
  const boundedPosition = getBoundedFixedPosition({
    left: card.offsetLeft,
    top: card.offsetTop
  }, card);
  applyFloatingButtonPosition(card, boundedPosition);
  data.minimizedX = boundedPosition.left;
  data.minimizedY = boundedPosition.top;

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

  window.addEventListener('resize', () => {
    if (isDeleted) return;
    const position = getBoundedFixedPosition({
      left: card.offsetLeft,
      top: card.offsetTop
    }, card);
    applyFloatingButtonPosition(card, position);
    data.minimizedX = position.left;
    data.minimizedY = position.top;
    saveNoteToStorage(data);
  });
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
  card.style.width = `${data.width}px`;
  card.style.height = `${data.height}px`;
  const initialPosition = getBoundedFixedPosition({
    left: data.x,
    top: data.y
  }, card);
  card.style.left = `${initialPosition.left}px`;
  card.style.top = `${initialPosition.top}px`;
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
  content.innerHTML = getNoteHtml(data);

  content.addEventListener('mousedown', (event) => {
    if (event.target.tagName === 'A') {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSafeUrl(event.target.href);
    }
  });

  content.addEventListener('blur', () => {
    if (isDeleted) return;
    data.content = content.innerText;
    data.contentHtml = content.innerHTML;
    saveNoteToStorage(data);
  });

  const footer = document.createElement('div');
  footer.className = 'sticky-footer';

  const reminderButton = document.createElement('button');
  reminderButton.type = 'button';
  reminderButton.className = `sticky-reminder-btn${data.reminder ? ' active' : ''}`;
  reminderButton.innerText = data.reminder ? 'A!' : 'A';
  reminderButton.title = data.reminder ? `Reminder: ${getCountdownText(data.reminder) || data.reminder}` : 'Set reminder';
  reminderButton.onmousedown = (event) => event.stopPropagation();

  const reminderPanel = document.createElement('div');
  reminderPanel.className = 'sticky-reminder-panel';
  reminderPanel.hidden = true;

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'date-picker';
  dateInput.title = 'Reminder time';
  dateInput.value = data.reminder || '';
  dateInput.onmousedown = (event) => event.stopPropagation();

  const clearReminderBtn = document.createElement('button');
  clearReminderBtn.type = 'button';
  clearReminderBtn.className = 'sticky-reminder-clear';
  clearReminderBtn.innerText = 'Clear';
  clearReminderBtn.disabled = !data.reminder;
  clearReminderBtn.onmousedown = (event) => event.stopPropagation();

  const countdownDiv = document.createElement('div');
  countdownDiv.className = 'countdown-text';

  const updateTimer = () => {
    countdownDiv.innerText = getCountdownText(dateInput.value);
    reminderButton.classList.toggle('active', Boolean(dateInput.value));
    reminderButton.innerText = dateInput.value ? 'A!' : 'A';
    reminderButton.title = dateInput.value ? `Reminder: ${countdownDiv.innerText || dateInput.value}` : 'Set reminder';
    clearReminderBtn.disabled = !dateInput.value;
  };

  updateTimer();
  timerInterval = setInterval(updateTimer, 60000);

  reminderButton.onclick = (event) => {
    event.stopPropagation();
    reminderPanel.hidden = !reminderPanel.hidden;
  };

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

  clearReminderBtn.onclick = () => {
    if (isDeleted) return;
    dateInput.value = '';
    data.reminder = '';
    saveNoteToStorage(data);
    clearReminder(data.id);
    updateTimer();
  };

  reminderPanel.appendChild(dateInput);
  reminderPanel.appendChild(clearReminderBtn);
  reminderPanel.appendChild(countdownDiv);
  footer.appendChild(reminderButton);
  footer.appendChild(reminderPanel);

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
    const position = getBoundedFixedPosition({
      left: initialLeft + event.clientX - startX,
      top: initialTop + event.clientY - startY
    }, card);
    applyFloatingButtonPosition(card, position);
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
    const position = getBoundedFixedPosition({
      left: card.offsetLeft,
      top: card.offsetTop
    }, card);
    applyFloatingButtonPosition(card, position);
    data.x = position.left;
    data.y = position.top;
    saveSize();
  });
  resizeObserver.observe(card);

  window.addEventListener('resize', () => {
    if (isDeleted) return;
    const position = getBoundedFixedPosition({
      left: card.offsetLeft,
      top: card.offsetTop
    }, card);
    applyFloatingButtonPosition(card, position);
    data.x = position.left;
    data.y = position.top;
    saveNoteToStorage(data);
  });
}
