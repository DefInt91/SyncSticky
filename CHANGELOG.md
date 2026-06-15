# Changelog

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
