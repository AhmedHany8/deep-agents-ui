chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "deep-agent:capture-visible") {
    return;
  }

  const windowId = sender.tab?.windowId;
  if (windowId == null) {
    sendResponse({ ok: false, error: "Missing window id" });
    return;
  }

  chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      sendResponse({ ok: false, error: runtimeError.message });
      return;
    }

    sendResponse({ ok: true, dataUrl });
  });

  return true;
});
