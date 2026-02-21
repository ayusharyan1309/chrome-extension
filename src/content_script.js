(function initContentScript() {
  if (window.__jdContentScriptLoaded) return;
  window.__jdContentScriptLoaded = true;

  let selectionInProgress = false;
  const AUTO_RETRY_DELAY_MS = 600;
  const AUTO_RETRY_ATTEMPTS = 4;

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = '__jd_select_overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.05)';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483646';
    overlay.style.border = '2px dashed #ff6b00';
    overlay.style.display = 'none';
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function startSelectMode() {
    if (selectionInProgress) {
      return Promise.resolve({ ok: false, error: 'Selection already in progress' });
    }

    selectionInProgress = true;
    const overlay = createOverlay();
    let highlighted = null;

    return new Promise((resolve) => {
      function cleanup() {
        selectionInProgress = false;
        overlay.remove();
        document.documentElement.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('click', onClick, true);
        window.removeEventListener('keydown', onKeyDown, true);
      }

      function onMouseMove(event) {
        const el = event.target;
        if (!el || el === overlay || el.id === '__jd_select_overlay') return;
        highlighted = el;
        const rect = el.getBoundingClientRect();

        overlay.style.display = 'block';
        overlay.style.top = `${Math.max(rect.top, 0)}px`;
        overlay.style.left = `${Math.max(rect.left, 0)}px`;
        overlay.style.width = `${Math.max(rect.width, 0)}px`;
        overlay.style.height = `${Math.max(rect.height, 0)}px`;
      }

      function onClick(event) {
        event.preventDefault();
        event.stopPropagation();

        const target = highlighted || event.target;
        const extractor = window.__jdExtract;
        const text = extractor?.cleanNodeText
          ? extractor.cleanNodeText(target)
          : (target?.innerText || target?.textContent || '').trim();

        cleanup();

        if (!text || text.length < 80) {
          resolve({ ok: false, error: 'Selected text too short. Try selecting a larger container.' });
          return;
        }

        resolve({ ok: true, text, meta: { mode: 'select' } });
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          cleanup();
          resolve({ ok: false, error: 'Selection cancelled' });
        }
      }

      document.documentElement.style.cursor = 'crosshair';
      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('click', onClick, true);
      window.addEventListener('keydown', onKeyDown, true);
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      if (message?.type === 'EXTRACT_JD_AUTO') {
        if (!window.__jdExtract?.extractFromPage) {
          sendResponse({ ok: false, error: 'Extractor not initialized' });
          return;
        }

        let result = { ok: false, error: 'Unknown extraction error' };
        for (let attempt = 1; attempt <= AUTO_RETRY_ATTEMPTS; attempt += 1) {
          result = window.__jdExtract.extractFromPage();
          if (result?.ok) break;

          await new Promise((resolve) => setTimeout(resolve, AUTO_RETRY_DELAY_MS));
          window.__jdExtract.clickButtonsByText?.(['show more', 'see more', 'more']);
        }

        sendResponse(result);
        return;
      }

      if (message?.type === 'START_JD_SELECT') {
        const result = await startSelectMode();
        sendResponse(result);
        return;
      }

      sendResponse({ ok: false, error: `Unhandled message type: ${message?.type}` });
    })();

    return true;
  });
})();
