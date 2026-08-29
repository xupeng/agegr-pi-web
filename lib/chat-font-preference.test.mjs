import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const {
  CHAT_FONT_SIZE_OFFSET_MAX,
  CHAT_FONT_SIZE_OFFSET_MIN,
  CHAT_FONT_SIZE_OFFSET_STORAGE_KEY,
  normalizeChatFontSizeOffset,
  readChatFontSizeOffset,
  writeChatFontSizeOffset,
} = await jiti.import("./chat-font-preference.ts");

function fakeStorage(initial = new Map()) {
  const map = new Map(initial);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test("normalizeChatFontSizeOffset clamps to [MIN, MAX]", () => {
  assert.equal(normalizeChatFontSizeOffset(0), 0);
  assert.equal(normalizeChatFontSizeOffset(2), 2);
  assert.equal(normalizeChatFontSizeOffset(-3), -3);
  assert.equal(normalizeChatFontSizeOffset(CHAT_FONT_SIZE_OFFSET_MAX + 10), CHAT_FONT_SIZE_OFFSET_MAX);
  assert.equal(normalizeChatFontSizeOffset(CHAT_FONT_SIZE_OFFSET_MIN - 10), CHAT_FONT_SIZE_OFFSET_MIN);
});

test("normalizeChatFontSizeOffset rounds and rejects non-finite values", () => {
  assert.equal(normalizeChatFontSizeOffset(1.6), 2);
  assert.equal(normalizeChatFontSizeOffset("2"), 2);
  assert.equal(normalizeChatFontSizeOffset(null), 0);
  assert.equal(normalizeChatFontSizeOffset(undefined), 0);
  assert.equal(normalizeChatFontSizeOffset("abc"), 0);
  assert.equal(normalizeChatFontSizeOffset(NaN), 0);
  assert.equal(normalizeChatFontSizeOffset(Infinity), 0);
});

test("readChatFontSizeOffset returns 0 when empty or corrupted", () => {
  assert.equal(readChatFontSizeOffset(fakeStorage()), 0);
  assert.equal(
    readChatFontSizeOffset(fakeStorage(new Map([[CHAT_FONT_SIZE_OFFSET_STORAGE_KEY, "not json"]]))),
    0,
  );
  assert.equal(
    readChatFontSizeOffset(fakeStorage(new Map([[CHAT_FONT_SIZE_OFFSET_STORAGE_KEY, "{oops"]]))),
    0,
  );
  assert.equal(readChatFontSizeOffset(null), 0);
});

test("readChatFontSizeOffset reads and normalizes stored value", () => {
  assert.equal(
    readChatFontSizeOffset(fakeStorage(new Map([[CHAT_FONT_SIZE_OFFSET_STORAGE_KEY, "3"]]))),
    3,
  );
  // 越界值读取时被 clamp
  assert.equal(
    readChatFontSizeOffset(fakeStorage(new Map([[CHAT_FONT_SIZE_OFFSET_STORAGE_KEY, "99"]]))),
    CHAT_FONT_SIZE_OFFSET_MAX,
  );
});

test("writeChatFontSizeOffset stores normalized JSON and round-trips", () => {
  const storage = fakeStorage();
  writeChatFontSizeOffset(2, storage);
  assert.equal(storage.getItem(CHAT_FONT_SIZE_OFFSET_STORAGE_KEY), "2");
  assert.equal(readChatFontSizeOffset(storage), 2);

  // 越界写入被 clamp 后仍可读回合法值
  writeChatFontSizeOffset(CHAT_FONT_SIZE_OFFSET_MAX + 5, storage);
  assert.equal(readChatFontSizeOffset(storage), CHAT_FONT_SIZE_OFFSET_MAX);
});

test("writeChatFontSizeOffset tolerates storage failures", () => {
  const throwing = {
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  assert.doesNotThrow(() => writeChatFontSizeOffset(1, throwing));
  assert.doesNotThrow(() => writeChatFontSizeOffset(1, null));
});
