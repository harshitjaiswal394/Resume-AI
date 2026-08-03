"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Bot, Sparkles, X, MessageCircle, Minus, GripHorizontal, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const LOG_PREFIX = "[ChatWidget]";
const log = {
  info:  (msg: string, data?: unknown) => console.info(`${LOG_PREFIX} ℹ️  ${msg}`, data ?? ""),
  warn:  (msg: string, data?: unknown) => console.warn(`${LOG_PREFIX} ⚠️  ${msg}`, data ?? ""),
  error: (msg: string, data?: unknown) => console.error(`${LOG_PREFIX} ❌ ${msg}`, data ?? ""),
};

const POS_KEY_LAUNCHER = "chat-widget-pos-launcher";
const POS_KEY_PANEL = "chat-widget-pos-panel";
const POS_KEY_PANEL_SIZE = "chat-widget-panel-size";
const DRAG_THRESHOLD = 3;
const MIN_PANEL_W = 300;
const MIN_PANEL_H = 360;

interface Pos { x: number; y: number }
interface Size { w: number; h: number }
type DragKind = "launcher" | "panel";
interface DragState {
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  moved: boolean;
  kind: DragKind;
}
interface ResizeState {
  startX: number;
  startY: number;
  origW: number;
  origH: number;
  origLeft: number;
  origTop: number;
  dir: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function loadPos(key: string): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === "number" && typeof p?.y === "number") return p as Pos;
  } catch {
    /* ignore */
  }
  return null;
}

function loadSize(): Size | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_KEY_PANEL_SIZE);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.w === "number" && typeof p?.h === "number") return p as Size;
  } catch {
    /* ignore */
  }
  return null;
}

export function ChatWidget() {
  const { user, isAuthReady } = useAuth();
  const pathname = usePathname();
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [launcherPos, setLauncherPos] = useState<Pos | null>(null);
  const [panelPos, setPanelPos] = useState<Pos | null>(null);
  const [panelSize, setPanelSize] = useState<Size | null>(null);
  const launcherPosRef = useRef<Pos | null>(null);
  const panelPosRef = useRef<Pos | null>(null);
  const panelSizeRef = useRef<Size | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const movedRef = useRef(false);

  const isChatPage = pathname === "/chat" || pathname?.startsWith("/chat/");

  // Only arm (show launcher) after a short delay, for logged-in users, off /chat.
  useEffect(() => {
    if (!isAuthReady || !user || isChatPage) {
      setArmed(false);
      return;
    }
    const t = setTimeout(() => setArmed(true), 3000);
    return () => clearTimeout(t);
  }, [isAuthReady, user, isChatPage]);

  // Close the panel if the user navigates to /chat directly.
  useEffect(() => {
    if (isChatPage) setOpen(false);
  }, [isChatPage]);

  // Restore previously dragged positions and size.
  useEffect(() => {
    const lp = loadPos(POS_KEY_LAUNCHER);
    const pp = loadPos(POS_KEY_PANEL);
    const ps = loadSize();
    launcherPosRef.current = lp;
    panelPosRef.current = pp;
    panelSizeRef.current = ps;
    setLauncherPos(lp);
    setPanelPos(pp);
    setPanelSize(ps);
  }, []);

  const persistPos = useCallback((kind: DragKind, p: Pos) => {
    if (kind === "launcher") {
      launcherPosRef.current = p;
      setLauncherPos(p);
      try {
        window.localStorage.setItem(POS_KEY_LAUNCHER, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    } else {
      panelPosRef.current = p;
      setPanelPos(p);
      try {
        window.localStorage.setItem(POS_KEY_PANEL, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>, kind: DragKind) => {
    // Only ignore presses on nested interactive elements (e.g. buttons/links
    // inside the panel header). The launcher itself is a <button>, so we must
    // NOT bail when the closest interactive element is the drag surface itself.
    const t = e.target as HTMLElement;
    const interactive = t.closest("button, a, input, textarea, select, iframe");
    if (interactive && interactive !== e.currentTarget) return;
    const el = e.currentTarget as HTMLElement;
    const rect =
      kind === "panel"
        ? (document.getElementById("chat-widget-panel")?.getBoundingClientRect() ?? el.getBoundingClientRect())
        : el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      moved: false,
      kind,
    };
    movedRef.current = false;
    el.setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const el = e.currentTarget as HTMLElement;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    movedRef.current = true;
    // For the panel, clamp against the panel's own size (not the drag handle's),
    // so grabbing a small corner handle keeps the whole widget on-screen.
    const rect =
      d.kind === "panel"
        ? (document.getElementById("chat-widget-panel")?.getBoundingClientRect() ?? el.getBoundingClientRect())
        : el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = clamp(d.origLeft + dx, 8, vw - rect.width - 8);
    const y = clamp(d.origTop + dy, 8, vh - rect.height - 8);
    persistPos(d.kind, { x, y });
  }, [persistPos]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  // ── Resize (all 8 edges/corners, like a desktop window) ────────────────────
  const persistSize = useCallback((s: Size) => {
    panelSizeRef.current = s;
    setPanelSize(s);
    try {
      window.localStorage.setItem(POS_KEY_PANEL_SIZE, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  const handleResizeDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = e.currentTarget.closest<HTMLElement>("#chat-widget-panel");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const dir = e.currentTarget.dataset.resizeDir as ResizeState["dir"];
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: rect.width,
      origH: rect.height,
      origLeft: rect.left,
      origTop: rect.top,
      dir,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const r = resizeRef.current;
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;

    const w = clamp(
      r.origW + (r.dir.includes("e") ? dx : r.dir.includes("w") ? -dx : 0),
      MIN_PANEL_W, vw - 16,
    );
    const h = clamp(
      r.origH + (r.dir.includes("s") ? dy : r.dir.includes("n") ? -dy : 0),
      MIN_PANEL_H, vh - 16,
    );

    // When resizing from the left/top edges the position must follow, so the
    // opposite (anchored) edge stays in place while the panel grows/shrinks.
    const cur = panelPosRef.current ?? { x: r.origLeft, y: r.origTop };
    let { x, y } = cur;
    if (r.dir.includes("w")) x = r.origLeft + (r.origW - w);
    if (r.dir.includes("n")) y = r.origTop + (r.origH - h);
    x = clamp(x, 8, vw - w - 8);
    y = clamp(y, 8, vh - h - 8);

    persistPos("panel", { x, y });
    persistSize({ w, h });
  }, [persistPos, persistSize]);

  const handleResizeUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    resizeRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const handleResetSize = useCallback(() => {
    log.info("Chat panel size reset to responsive default");
    panelSizeRef.current = null;
    setPanelSize(null);
    try {
      window.localStorage.removeItem(POS_KEY_PANEL_SIZE);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setOpen(prev => {
      log.info(prev ? "Chat widget minimized" : "Chat widget opened");
      return !prev;
    });
  };

  const handleLauncherClick = () => {
    if (movedRef.current) return; // was a drag, not a click
    toggle();
  };

  const handleMinimize = () => {
    log.info("Chat widget minimized");
    setOpen(false);
  };

  const handleClose = () => {
    log.info("Chat widget dismissed");
    setOpen(false);
    setArmed(false);
  };

  if (isChatPage) return null;

  const launcherAnchoredClass = launcherPos ? "" : "bottom-4 right-4 sm:bottom-6 sm:right-6";
  const launcherPosStyle = launcherPos ? { left: launcherPos.x, top: launcherPos.y } : undefined;
  const panelAnchoredClass = panelPos ? "" : "bottom-4 right-4 sm:bottom-6 sm:right-6";
  const panelPosStyle = panelPos ? { left: panelPos.x, top: panelPos.y } : undefined;
  const panelSizingClass = panelSize
    ? ""
    : "h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] sm:h-[82vh] sm:max-h-[760px] sm:w-[min(480px,calc(100vw-2rem))]";
  const panelStyle = {
    ...(panelPosStyle ?? {}),
    ...(panelSize ? { width: panelSize.w, height: panelSize.h } : {}),
  };

  return (
    <>
      {/* ── Launcher button ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {armed && !open && (
          <motion.button
            type="button"
            id="chat-widget-launcher"
            onClick={handleLauncherClick}
            onPointerDown={(e) => handlePointerDown(e, "launcher")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            initial={{ opacity: 0, scale: 0.6, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 24 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className={`fixed z-[90] group flex items-center gap-3 touch-none select-none ${launcherAnchoredClass}`}
            style={launcherPosStyle}
            aria-label="Open AI chat assistant"
            title="Drag to move · Click to open"
          >
            <span className="pointer-events-none hidden lg:block rounded-full border border-white/10 bg-slate-950/85 px-3.5 py-2 text-sm font-medium text-slate-100 shadow-xl shadow-black/30 backdrop-blur-xl opacity-0 translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
              Chat with your AI assistant
            </span>
            <span className="relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 text-white shadow-2xl shadow-indigo-900/50 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105 cursor-grab active:cursor-grabbing">
              <span className="absolute inset-0 rounded-full bg-indigo-500/40 animate-ping" style={{ animationDuration: "2.2s" }} />
              <MessageCircle className="relative h-6 w-6 sm:h-7 sm:w-7" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#050816]">
                <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" />
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat panel (embeds the real /chat page) ─────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className={`fixed z-[90] flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#050816] shadow-2xl shadow-black/60 ${panelSizingClass} ${panelAnchoredClass}`}
            style={panelStyle}
            id="chat-widget-panel"
          >
            <div
              className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-3 touch-none select-none"
              onPointerDown={(e) => handlePointerDown(e, "panel")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ cursor: "grab" }}
              title="Drag to move"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">AI Assistant</div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Online
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="hidden sm:flex items-center gap-1 pr-1 text-slate-500" title="Drag to move">
                  <GripHorizontal className="h-4 w-4" />
                </span>
                <button
                  type="button"
                  onClick={handleResetSize}
                  className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Reset chat window size"
                  title="Reset window size"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <a
                  href="/chat"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Open chat in full screen"
                  title="Open full screen"
                >
                  <Sparkles className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={handleMinimize}
                  className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Minimize chat assistant"
                  title="Minimize"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close chat assistant"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <iframe
              src="/chat?embedded=1"
              title="ResuMatch AI Chat Assistant"
              className="h-full w-full flex-1 border-0 bg-[#050816]"
              allow="microphone"
            />

            {/* ── Edge resize handles + corner drag handles ───────────────────── */}
            <div
              data-resize-dir="n"
              onPointerDown={handleResizeDown}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeUp}
              className="absolute left-2 right-2 top-0 z-20 h-1.5 cursor-n-resize touch-none"
              title="Drag to resize"
            />
            <div
              data-resize-dir="s"
              onPointerDown={handleResizeDown}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeUp}
              className="absolute bottom-0 left-2 right-2 z-20 h-1.5 cursor-s-resize touch-none"
              title="Drag to resize"
            />
            <div
              data-resize-dir="w"
              onPointerDown={handleResizeDown}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeUp}
              className="absolute bottom-2 top-2 left-0 z-20 w-1.5 cursor-w-resize touch-none"
              title="Drag to resize"
            />
            <div
              data-resize-dir="e"
              onPointerDown={handleResizeDown}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeUp}
              className="absolute bottom-2 top-2 right-0 z-20 w-1.5 cursor-e-resize touch-none"
              title="Drag to resize"
            />
            <div
              data-resize-dir="sw"
              onPointerDown={(e) => handlePointerDown(e, "panel")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="group absolute bottom-0 left-0 z-30 flex h-6 w-6 cursor-grab items-center justify-center rounded-bl-xl touch-none active:cursor-grabbing"
              title="Drag to move"
            >
              <span className="pointer-events-none grid h-3.5 w-3.5 grid-cols-2 gap-0.5 opacity-60 transition group-hover:opacity-100">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              </span>
            </div>
            <div
              data-resize-dir="se"
              onPointerDown={(e) => handlePointerDown(e, "panel")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="group absolute bottom-0 right-0 z-30 flex h-6 w-6 cursor-grab items-center justify-center rounded-br-xl touch-none active:cursor-grabbing"
              title="Drag to move"
            >
              <span className="pointer-events-none grid h-3.5 w-3.5 grid-cols-2 gap-0.5 opacity-60 transition group-hover:opacity-100">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
