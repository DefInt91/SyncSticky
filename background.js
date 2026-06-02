const ALARM_PREFIX = 'note:';

function getAlarmName(noteId) {
  return `${ALARM_PREFIX}${noteId}`;
}

function getNoteIdFromAlarm(alarmName) {
  return alarmName.startsWith(ALARM_PREFIX) ? alarmName.slice(ALARM_PREFIX.length) : '';
}

function createReminder(noteId, reminderTime) {
  const alarmName = getAlarmName(noteId);
  chrome.alarms.clear(alarmName, () => {
    const when = new Date(reminderTime).getTime();
    if (Number.isFinite(when) && when > Date.now()) {
      chrome.alarms.create(alarmName, { when });
    }
  });
}

function clearReminder(noteId) {
  chrome.alarms.clear(getAlarmName(noteId));
}

function syncReminderAlarms() {
  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const activeReminderMap = new Map();

    notes.forEach((note) => {
      const when = new Date(note.reminder).getTime();
      if (note.id && Number.isFinite(when) && when > Date.now()) {
        activeReminderMap.set(getAlarmName(note.id), when);
      }
    });

    chrome.alarms.getAll((alarms) => {
      alarms
        .filter((alarm) => alarm.name.startsWith(ALARM_PREFIX))
        .forEach((alarm) => {
          if (!activeReminderMap.has(alarm.name)) {
            chrome.alarms.clear(alarm.name);
          }
        });

      activeReminderMap.forEach((when, alarmName) => {
        chrome.alarms.get(alarmName, (alarm) => {
          if (alarm && Math.abs(alarm.scheduledTime - when) < 1000) return;
          chrome.alarms.clear(alarmName, () => {
            chrome.alarms.create(alarmName, { when });
          });
        });
      });
    });
  });
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'dashboard.html' });
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message.noteId) return;

  if (message.type === 'scheduleReminder') {
    createReminder(message.noteId, message.reminderTime);
  }

  if (message.type === 'clearReminder') {
    clearReminder(message.noteId);
  }
});

chrome.runtime.onInstalled.addListener(syncReminderAlarms);
chrome.runtime.onStartup.addListener(syncReminderAlarms);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.notes) {
    syncReminderAlarms();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  const noteId = getNoteIdFromAlarm(alarm.name);
  if (!noteId) return;

  chrome.storage.sync.get(['notes'], (result) => {
    const notes = result.notes || [];
    const note = notes.find((item) => item.id === noteId);
    const content = note?.content?.trim();
    const message = content ? content.slice(0, 120) : 'A sticky note reminder is due.';

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Sticky note reminder',
      message,
      priority: 2
    });
  });
});
