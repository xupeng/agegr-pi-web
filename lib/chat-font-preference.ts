/**
 * 对话区字号偏好：以当前默认字号为基准的相对偏移（px）。
 *
 * 与 banban 的 detailFontSizePreference 同款模式：localStorage 只存一个
 * clamp 在 [MIN, MAX] 的整数 offset（0 = 当前默认字号），读取/写入都经过
 * normalize 校验，损坏或越界时回落默认 0。
 */

export const CHAT_FONT_SIZE_OFFSET_MIN = -4;
export const CHAT_FONT_SIZE_OFFSET_MAX = 4;
export const CHAT_FONT_SIZE_OFFSET_STORAGE_KEY = "pi-chat-font-offset";

export function normalizeChatFontSizeOffset(value: unknown): number {
  const offset = Math.round(Number(value));
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(
    CHAT_FONT_SIZE_OFFSET_MIN,
    Math.min(CHAT_FONT_SIZE_OFFSET_MAX, offset),
  );
}

export function readChatFontSizeOffset(
  storage: Pick<Storage, "getItem"> | null = getLocalStorage(),
): number {
  if (!storage) {
    return 0;
  }

  try {
    const storedValue = storage.getItem(CHAT_FONT_SIZE_OFFSET_STORAGE_KEY);
    if (storedValue === null) {
      return 0;
    }
    return normalizeChatFontSizeOffset(JSON.parse(storedValue));
  } catch {
    // localStorage 可能不可用或存了非法值。
    return 0;
  }
}

export function writeChatFontSizeOffset(
  offset: unknown,
  storage: Pick<Storage, "setItem"> | null = getLocalStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      CHAT_FONT_SIZE_OFFSET_STORAGE_KEY,
      JSON.stringify(normalizeChatFontSizeOffset(offset)),
    );
  } catch {
    // localStorage 可能在私有或嵌入式浏览器上下文中不可用。
  }
}

function getLocalStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
