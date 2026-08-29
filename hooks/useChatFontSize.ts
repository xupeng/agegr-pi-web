"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  CHAT_FONT_SIZE_OFFSET_STORAGE_KEY,
  normalizeChatFontSizeOffset,
  readChatFontSizeOffset,
  writeChatFontSizeOffset,
} from "@/lib/chat-font-preference";

const listeners = new Set<() => void>();
let offset: number | null = null;
let storageListenerAttached = false;

function emit(): void {
  listeners.forEach((cb) => cb());
}

function ensureOffset(): number {
  if (typeof window === "undefined") return 0;
  if (offset === null) {
    offset = readChatFontSizeOffset();
  }
  return offset;
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== CHAT_FONT_SIZE_OFFSET_STORAGE_KEY) return;
  offset = readChatFontSizeOffset();
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  ensureOffset();
  if (!storageListenerAttached && typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageChange);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): number {
  return ensureOffset();
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * 对话区字号偏移（px，0 = 当前默认字号）。设置面板与 ChatWindow 共享，
 * 任一处的修改通过模块级订阅即时同步到另一处（跨标签页经 storage 事件）。
 */
export function useChatFontSize() {
  const chatFontSizeOffset = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setChatFontSizeOffset = useCallback((next: number) => {
    const normalized = normalizeChatFontSizeOffset(next);
    if (normalized === ensureOffset()) return;
    writeChatFontSizeOffset(normalized);
    offset = normalized;
    emit();
  }, []);

  return {
    chatFontSizeOffset,
    setChatFontSizeOffset,
  };
}
