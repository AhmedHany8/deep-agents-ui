"use client";

import React, { useCallback, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { MousePointerClick, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SimpleBrowserPanel() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [urlInput, setUrlInput] = useState("https://penpot.app");
  const [currentUrl, setCurrentUrl] = useState("https://penpot.app");
  const [status, setStatus] = useState("Ready");
  const [bridgeReady, setBridgeReady] = useState(false);

  const pingBridge = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "deep-agent:bridge-ping" },
      "*"
    );
  }, []);

  const navigate = useCallback(() => {
    const value = urlInput.trim();
    if (!value) return;
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    setCurrentUrl(normalized);
    setBridgeReady(false);
    setStatus("Loaded");
  }, [urlInput]);

  const openInNewTab = useCallback(() => {
    window.open(currentUrl, "_blank", "noopener,noreferrer");
  }, [currentUrl]);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      const sourceMatches = event.source === iframeRef.current?.contentWindow;
      const penpotOrigin =
        typeof event.origin === "string" && event.origin.includes("penpot.app");

      if (data.type === "deep-agent:penpot-bridge-ready") {
        if (sourceMatches || penpotOrigin) {
          setBridgeReady(true);
          setStatus("Bridge connected");
        }
        return;
      }

      if (data.type === "deep-agent:request-iframe-rect") {
        if (!sourceMatches) return;
        const rect = iframeRef.current?.getBoundingClientRect();
        if (!rect) return;

        (event.source as WindowProxy)?.postMessage(
          {
            type: "deep-agent:iframe-rect-response",
            requestId: data.requestId,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          },
          event.origin || "*"
        );
      }

      if (data.type === "deep-agent:element-picked") {
        setStatus("Element added to chat");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (!bridgeReady) {
        pingBridge();
      }
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [bridgeReady, pingBridge]);

  const emitPayload = useCallback((payload: Record<string, unknown>) => {
    window.postMessage(
      {
        type: "deep-agent:element-picked",
        payload,
      },
      "*"
    );
  }, []);

  const startSameOriginPicker = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe) return false;

    try {
      const doc = iframe.contentDocument;
      const frameWindow = iframe.contentWindow;
      if (!doc || !frameWindow) return false;

      const body = doc.body;
      if (!body) return false;

      setStatus("Select an element...");

      let hovered: HTMLElement | null = null;
      let prevOutline = "";
      let prevOutlineOffset = "";

      const clearHover = () => {
        if (!hovered) return;
        hovered.style.outline = prevOutline;
        hovered.style.outlineOffset = prevOutlineOffset;
        hovered = null;
        prevOutline = "";
        prevOutlineOffset = "";
      };

      const cleanup = () => {
        doc.removeEventListener("mouseover", onMouseOver, true);
        doc.removeEventListener("click", onClick, true);
        doc.removeEventListener("keydown", onKeyDown, true);
        clearHover();
        if (body) {
          body.style.cursor = "";
        }
      };

      const onMouseOver = (event: Event) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;

        if (hovered !== target) {
          clearHover();
          prevOutline = target.style.outline;
          prevOutlineOffset = target.style.outlineOffset;
          hovered = target;
        }

        target.style.outline = "2px solid hsl(var(--primary))";
        target.style.outlineOffset = "2px";
      };

      const onKeyDown = (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key === "Escape") {
          keyEvent.preventDefault();
          cleanup();
          setStatus("Selection cancelled");
        }
      };

      const onClick = async (event: Event) => {
        const mouseEvent = event as MouseEvent;
        const target = event.target as HTMLElement | null;
        if (!target) return;

        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();

        const rect = target.getBoundingClientRect();
        const computedStyle = frameWindow.getComputedStyle(target);

        const selector = `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}${
          target.className
            ? `.${String(target.className)
                .split(/\s+/)
                .filter(Boolean)
                .join(".")}`
            : ""
        }`;

        let screenshotDataUrl = "";
        try {
          const canvas = await html2canvas(target, {
            backgroundColor: null,
            useCORS: true,
            logging: false,
            scale: Math.min(window.devicePixelRatio || 1, 2),
          });
          screenshotDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        } catch {
          screenshotDataUrl = "";
        }

        emitPayload({
          selector,
          html: target.outerHTML,
          text: (target.textContent || "").replace(/\s+/g, " ").trim(),
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          styles: {
            display: computedStyle.display,
            position: computedStyle.position,
            width: computedStyle.width,
            height: computedStyle.height,
            margin: computedStyle.margin,
            padding: computedStyle.padding,
            color: computedStyle.color,
            backgroundColor: computedStyle.backgroundColor,
            border: computedStyle.border,
            borderRadius: computedStyle.borderRadius,
            fontSize: computedStyle.fontSize,
            fontWeight: computedStyle.fontWeight,
            lineHeight: computedStyle.lineHeight,
            boxShadow: computedStyle.boxShadow,
          },
          screenshotDataUrl,
        });

        cleanup();
        setStatus("Element added to chat");
      };

      body.style.cursor = "crosshair";
      doc.addEventListener("mouseover", onMouseOver, true);
      doc.addEventListener("click", onClick, true);
      doc.addEventListener("keydown", onKeyDown, true);
      return true;
    } catch {
      return false;
    }
  }, [emitPayload]);

  const startPick = useCallback(async () => {
    const pickedInSameOrigin = await startSameOriginPicker();
    if (pickedInSameOrigin) return;

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      setStatus("Browser frame unavailable");
      return;
    }

    if (!bridgeReady) {
      pingBridge();
      setStatus("Bridge not connected. Reload extension and refresh page.");
      return;
    }

    iframe.contentWindow.postMessage({ type: "deep-agent:start-picker" }, "*");
    setStatus("Select an element inside the iframe...");
  }, [bridgeReady, pingBridge, startSameOriginPicker]);

  return (
    <div className="flex h-full min-w-[340px] flex-1 flex-col border-l border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              navigate();
            }
          }}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          placeholder="Enter URL"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={navigate}
        >
          Go
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openInNewTab}
          aria-label="Open in new tab"
          title="Open in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={startPick}
          aria-label="Add element to chat"
          title="Add element to chat"
        >
          <MousePointerClick className="h-4 w-4" />
        </Button>
        <span
          className={`h-2 w-2 rounded-full ${
            bridgeReady ? "bg-emerald-500" : "bg-amber-500"
          }`}
          title={bridgeReady ? "Bridge connected" : "Bridge not connected"}
        />
      </div>
      <iframe
        ref={iframeRef}
        title="Simple Browser"
        src={currentUrl}
        onLoad={() => {
          setBridgeReady(false);
          setStatus("Frame loaded");
          pingBridge();
        }}
        className="w-full flex-1 bg-background"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
