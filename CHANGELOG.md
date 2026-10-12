# Changelog

## 6.0
- Added `note-utils.js` as a shared utility module (`getTimestamp`, `debounce`, `escapeHtml`, `linkify`, `getNoteHtml`, `stripHtml`, `getCountdownText`, `isHexColor`, `normalizeAppSettings`, `normalizeNote`, `openSafeUrl`, `scheduleReminder`, `clearReminder`), removing the duplicate copies that had drifted between `content.js` and `dashboard.js`.
- Standardized on the more defensive `normalizeNote` implementation, which also guards `minimized`/`minimizedX`/`minimizedY` defaults.
- Wrapped `scheduleReminder`/`clearReminder` messaging in try/catch with a `chrome.runtime.lastError` check to avoid uncaught errors after the extension reloads.
- Added a dedicated drag grip (`.todo-card-grip`) to dashboard todo cards and set the note content to `draggable = false`, so dragging a card between columns and selecting text inside a card no longer conflict.
- Changed todo column height from an absolute pixel value to a relative `vh` unit (default 60vh, clamped 20-90vh) so column height scales sensibly across different screen sizes; existing pixel-based heights are clamped to a valid vh value on next load.
- Replaced the hardcoded `102400` byte quota in the storage stats panel with `chrome.storage.sync.QUOTA_BYTES`.
- Removed the unused `style.css` `<link>` from `dashboard.html` (the dashboard's own Kanban styles are inline; `style.css` remains in use via `manifest.json`'s `content_scripts` for webpage sticky notes).
- Removed `characters.json`, the last remnant of the in-page character/game runtime removed in 5.6.

## 5.9
- Fixed resize handling so the floating add button and edge reminder bar keep their last snapped edge after the browser is restored from a narrow width.

## 5.8
- Kept the floating add button on the right side with a bottom anchor when viewport size changes.
- Kept the edge reminder bar on the right side with a top anchor when viewport size changes.
- Added a max height to the edge reminder bar so its default position does not overlap the add button.

## 5.7
- Replaced the single synced `notes` payload with per-note `note:<id>` sync entries.
- Added automatic migration from legacy `notes` storage into the new note-per-key format.
- Updated dashboard, webpage sticky notes, reminders, and import/export to use the new note store.
- Added a storage stats panel in Settings so sync usage and largest notes are visible.

## 5.6
- Removed the in-page character/game runtime from the sticky note tool while keeping character assets in the project.
- Returned note body storage to plain text in `chrome.storage.sync` to reduce sync quota failures.
- Kept pasted line breaks and spaces through plain-text rendering, with URLs linkified only when displayed.
- Removed rich HTML note backup/import paths so exports stay lightweight.

## 5.5
- Added spritesheet character support through `Character/characters.json`.
- Added action-specific frames for `cat_10.png`, including walk, climb, idle, sleep, and play states.
- Kept single-image character definitions compatible with the new character manifest format.

## 5.3
- Fixed formatted note creation failures caused by storing rich HTML directly in `chrome.storage.sync`.
- Moved rich note HTML into local storage while keeping sync notes lightweight.
- Kept import/export support for formatted note HTML.
- Added visible save error handling so note creation no longer fails silently.

## 5.2 Known Issue
- Formatted pasted content was stored directly in the synced `notes` payload.
- Large or complex rich HTML could exceed Chrome sync storage limits, causing `Add Note` creation to appear successful while the note was not actually saved.
- The create dialog closed even when storage failed, making the failure hard to notice.

## 4.6
- Refined dashboard and sticky styling with a production-grade operations board aesthetic.

## 4.5
- Changed dashboard todo status labels to English.

## 4.4
- Fixed sticky note text and date picker contrast on dark websites.

## 4.3
- Added minimizable webpage sticky notes with draggable minimized chips.
- Reworked the dashboard into an interactive four-column todo board.

## 4.2
- Added a fixed extension key so unpacked installs can keep the same extension ID across devices.
- Kept memo data on `chrome.storage.sync` for Chrome account synchronization.

## 4.1
- Fixed extension manifest and script syntax issues.
- Rebuilt corrupted UI text in English.
- Stabilized note reminders with `note:{id}` alarm names.
- Improved note position, size, and z-index persistence.
- Escaped note content before linkifying URLs.
- Cleaned up note timers and observers when notes are removed.
- Added a draggable floating add button with saved position.