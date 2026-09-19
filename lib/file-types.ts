export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
export const IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
export const DOCX_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

export type DocumentPreviewKind = "pdf" | "docx";

export const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

export const AUDIO_EXT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  weba: "audio/webm",
};

export const VIDEO_EXT_TO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
};

export const DOCUMENT_EXT_TO_MIME: Record<DocumentPreviewKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function getBaseName(filePath: string): string {
  return filePath.replace(/\\/g, "/").split("/").pop() ?? "";
}

export function getFileExt(filePath: string): string {
  return getBaseName(filePath).toLowerCase().split(".").pop() ?? "";
}

export type FileCategory = "document" | "code" | "image" | "data" | "config" | "other";

const DOCUMENT_EXTENSIONS = new Set([
  "md", "markdown", "mdx", "txt", "text", "rst", "adoc", "pdf", "doc", "docx", "odt", "rtf", "tex",
]);
const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "py", "pyi", "rb", "go", "rs", "java", "kt", "kts",
  "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "php", "swift", "scala", "sh", "bash", "zsh", "fish",
  "sql", "html", "htm", "css", "scss", "sass", "less", "vue", "svelte", "lua", "r", "pl", "pm", "ex", "exs",
  "erl", "hs", "clj", "cljs", "dart", "zig", "nim", "v", "asm", "gradle", "proto",
]);
const DATA_EXTENSIONS = new Set([
  "json", "jsonc", "json5", "jsonl", "ndjson", "yaml", "yml", "toml", "csv", "tsv", "xml", "db", "sqlite",
  "sqlite3", "parquet", "avro", "har",
]);
const CONFIG_EXTENSIONS = new Set([
  "ini", "cfg", "conf", "properties", "env", "lock", "editorconfig", "gitignore", "gitattributes", "dockerignore",
  "npmrc", "nvmrc", "babelrc", "eslintrc", "prettierrc", "terraformrc",
]);

/**
 * Coarse bucket used by the turn artifact card's type line. Falls back to
 * `other` for extension-less files (e.g. `Makefile`) and anything unrecognized.
 */
export function getFileCategory(filePath: string): FileCategory {
  const ext = getFileExt(filePath);
  if (!ext) return "other";
  if (IMAGE_EXT_TO_MIME[ext]) return "image";
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (DATA_EXTENSIONS.has(ext)) return "data";
  if (CONFIG_EXTENSIONS.has(ext)) return "config";
  return "other";
}

export function getImageMime(filePath: string): string | null {
  return IMAGE_EXT_TO_MIME[getFileExt(filePath)] ?? null;
}

export function getAudioMime(filePath: string): string | null {
  return AUDIO_EXT_TO_MIME[getFileExt(filePath)] ?? null;
}

export function getVideoMime(filePath: string): string | null {
  return VIDEO_EXT_TO_MIME[getFileExt(filePath)] ?? null;
}

export function getDocumentMime(filePath: string): string | null {
  return DOCUMENT_EXT_TO_MIME[getFileExt(filePath) as DocumentPreviewKind] ?? null;
}

export function documentPreviewKind(filePath: string): DocumentPreviewKind | null {
  const ext = getFileExt(filePath);
  if (ext === "pdf" || ext === "docx") return ext;
  return null;
}

export function isImagePath(filePath: string): boolean {
  return getImageMime(filePath) !== null;
}

export function isAudioPath(filePath: string): boolean {
  return getAudioMime(filePath) !== null;
}

export function isVideoPath(filePath: string): boolean {
  return getVideoMime(filePath) !== null;
}

export function isDocumentPreviewPath(filePath: string): boolean {
  return documentPreviewKind(filePath) !== null;
}
