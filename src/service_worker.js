const JD_MESSAGE_TIMEOUT_MS = 15000;

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('sidePanel behavior setup failed:', err);
  }
});

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs?.[0]?.id;
  if (!tabId) {
    throw new Error('No active tab found');
  }
  return tabId;
}

async function ensureContentScripts(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['jd_extract.js', 'content_script.js']
    });
  } catch (err) {
    // Injection can fail on restricted pages (chrome://, web store); fallback to existing scripts.
    console.debug('Script reinjection skipped:', err?.message || err);
  }
}

function sendTabMessageWithTimeout(tabId, payload) {
  return new Promise((resolve, reject) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('Timed out waiting for content script response'));
    }, JD_MESSAGE_TIMEOUT_MS);

    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message?.type) {
      sendResponse({ ok: false, error: 'Missing message type' });
      return;
    }

    if (message.type === 'EXTRACT_JD_AUTO' || message.type === 'START_JD_SELECT') {
      const tabId = await getActiveTabId();
      await ensureContentScripts(tabId);
      const response = await sendTabMessageWithTimeout(tabId, { type: message.type });
      sendResponse(response || { ok: false, error: 'No response from content script' });
      return;
    }

    if (message.type === 'PING') {
      sendResponse({ ok: true, source: 'service_worker' });
      return;
    }

    sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
  })().catch((err) => {
    sendResponse({ ok: false, error: err?.message || String(err) });
  });

  return true;
});
