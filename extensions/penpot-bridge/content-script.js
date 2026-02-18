const state = {
  active: false,
  hovered: null,
  prevOutline: "",
  prevOutlineOffset: "",
};

function clearHover() {
  if (!state.hovered) return;
  state.hovered.style.outline = state.prevOutline;
  state.hovered.style.outlineOffset = state.prevOutlineOffset;
  state.hovered = null;
  state.prevOutline = "";
  state.prevOutlineOffset = "";
}

function buildSelector(element) {
  const idPart = element.id ? `#${element.id}` : "";
  const classPart = element.className
    ? `.${String(element.className).split(/\\s+/).filter(Boolean).join(".")}`
    : "";
  return `${element.tagName.toLowerCase()}${idPart}${classPart}`;
}

function getStyleSnapshot(element) {
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    position: style.position,
    width: style.width,
    height: style.height,
    margin: style.margin,
    padding: style.padding,
    color: style.color,
    backgroundColor: style.backgroundColor,
    border: style.border,
    borderRadius: style.borderRadius,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    boxShadow: style.boxShadow,
  };
}

function requestIframeRect() {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ x: 0, y: 0, width: 0, height: 0 });
    }, 1500);

    function onMessage(event) {
      const data = event.data;
      if (!data || data.type !== "deep-agent:iframe-rect-response") return;
      if (data.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(data.rect || { x: 0, y: 0, width: 0, height: 0 });
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        type: "deep-agent:request-iframe-rect",
        requestId,
      },
      "*"
    );
  });
}

function captureVisible() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "deep-agent:capture-visible" }, (response) => {
      if (!response || response.ok !== true || !response.dataUrl) {
        resolve(null);
        return;
      }
      resolve(response.dataUrl);
    });
  });
}

function cropScreenshot(fullDataUrl, crop) {
  return new Promise((resolve) => {
    if (!fullDataUrl) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const sx = Math.max(0, Math.round(crop.x));
      const sy = Math.max(0, Math.round(crop.y));
      const sw = Math.max(1, Math.round(crop.width));
      const sh = Math.max(1, Math.round(crop.height));

      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };

    image.onerror = () => resolve(null);
    image.src = fullDataUrl;
  });
}

async function emitSelectedElement(element) {
  const rect = element.getBoundingClientRect();
  const iframeRect = await requestIframeRect();
  const dpr = window.devicePixelRatio || 1;

  const fullScreenshot = await captureVisible();
  const screenshotDataUrl = await cropScreenshot(fullScreenshot, {
    x: (iframeRect.x + rect.x) * dpr,
    y: (iframeRect.y + rect.y) * dpr,
    width: rect.width * dpr,
    height: rect.height * dpr,
  });

  window.parent.postMessage(
    {
      type: "deep-agent:element-picked",
      payload: {
        selector: buildSelector(element),
        html: element.outerHTML,
        text: (element.textContent || "").replace(/\\s+/g, " ").trim(),
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        styles: getStyleSnapshot(element),
        screenshotDataUrl,
      },
    },
    "*"
  );
}

function stopPicker() {
  state.active = false;
  clearHover();
  document.body.style.cursor = "";
  document.removeEventListener("mouseover", onMouseOver, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);
}

function onMouseOver(event) {
  if (!state.active) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (state.hovered !== target) {
    clearHover();
    state.prevOutline = target.style.outline;
    state.prevOutlineOffset = target.style.outlineOffset;
    state.hovered = target;
  }

  target.style.outline = "2px solid #22c55e";
  target.style.outlineOffset = "2px";
}

async function onClick(event) {
  if (!state.active) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  event.preventDefault();
  event.stopPropagation();
  stopPicker();
  await emitSelectedElement(target);
}

function onKeyDown(event) {
  if (!state.active) return;
  if (event.key === "Escape") {
    event.preventDefault();
    stopPicker();
  }
}

function startPicker() {
  if (state.active) return;
  state.active = true;
  document.body.style.cursor = "crosshair";
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "deep-agent:bridge-ping") {
    window.parent.postMessage({ type: "deep-agent:penpot-bridge-ready" }, "*");
    return;
  }
  if (data.type === "deep-agent:start-picker") {
    startPicker();
  }
});

window.parent.postMessage({ type: "deep-agent:penpot-bridge-ready" }, "*");
