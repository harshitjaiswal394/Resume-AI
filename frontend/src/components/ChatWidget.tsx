"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Bot, Sparkles, X, MessageCircle, Minus, GripHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const LOG_PREFIX = "[ChatWidget]";
const log = {
  info:  (msg: string, data?: unknown) => console.info(`${LOG_PREFIX} ℹ️  ${msg}`, data ?? ""),
  warn:  (msg: string, data?: unknown) => console.warn(`${LOG_PREFIX} ⚠️  ${msg}`, data ?? ""),
  error: (msg: string, data?: unknown) => console.error(`${LOG_PREFIX} ❌ ${msg}`, data ?? ""),
};

const POS_KEY = "chat-widget-pos";
const DRAG_THRESHOLD = 5;

interface Pos { x: number; y: number }
interface DragState {
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  moved: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function loadPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.x === "number" && typeof p?.y === "number") return p as Pos;
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
  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos | null>(null);
  const dragRef = useRef<DragState | null>(null);
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

  // Restore a previously dragged position.
  useEffect(() => {
    const p = loadPos();
    posRef.current = p;
    setPos(p);
  }, []);

  const persistPos = useCallback((p: Pos) => {
    posRef.current = p;
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Only ignore presses on nested interactive elements (e.g. buttons/links
    // inside the panel header). The launcher itself is a <button>, so we must
    // NOT bail when the closest interactive element is the drag surface itself.
    const t = e.target as HTMLElement;
    const interactive = t.closest("button, a, input, textarea, select, iframe");
    if (interactive && interactive !== e.currentTarget) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      moved: false,
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
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = clamp(d.origLeft + dx, 8, vw - rect.width - 8);
    const y = clamp(d.origTop + dy, 8, vh - rect.height - 8);
    persistPos({ x, y });
    setPos({ x, y });
  }, [persistPos]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
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

  const anchoredClass = pos ? "" : "bottom-6 right-6";
  const posStyle = pos ? { left: pos.x, top: pos.y } : undefined;

  return (
    <>
      {/* ── Launcher button ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {armed && !open && (
          <motion.button
            type="button"
            id="chat-widget-launcher"
            onClick={handleLauncherClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            initial={{ opacity: 0, scale: 0.6, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 24 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className={`fixed z-[90] group flex items-center gap-3 touch-none select-none ${anchoredClass}`}
            style={posStyle}
            aria-label="Open AI chat assistant"
            title="Drag to move · Click to open"
          >
            <span className="pointer-events-none hidden md:block rounded-full border border-white/10 bg-slate-950/85 px-3.5 py-2 text-sm font-medium text-slate-100 shadow-xl shadow-black/30 backdrop-blur-xl opacity-0 translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
              Chat with your AI assistant
            </span>
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 text-white shadow-2xl shadow-indigo-900/50 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105 cursor-grab active:cursor-grabbing">
              <span className="absolute inset-0 rounded-full bg-indigo-500/40 animate-ping" style={{ animationDuration: "2.2s" }} />
              <MessageCircle className="relative h-7 w-7" />
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#050816]">
                <Sparkles className="h-3 w-3 text-white" />
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
            className={`fixed z-[90] flex h-[82vh] max-h-[760px] w-[min(480px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#050816] shadow-2xl shadow-black/60 ${anchoredClass}`}
            style={posStyle}
            id="chat-widget-panel"
          >
            <div
              className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-3 touch-none select-none"
              onPointerDown={handlePointerDown}
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
                    ResuMatch AI
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="hidden sm:flex items-center gap-1 pr-1 text-slate-500" title="Drag to move">
                  <GripHorizontal className="h-4 w-4" />
                </span>
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
