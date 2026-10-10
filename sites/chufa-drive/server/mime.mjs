// Content types and preview policy. Anything that could execute script in the
// chufa.wang origin (HTML, SVG, XML, JS) is never served as an active document.
const TYPES = {
  // images
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml',
  // video / audio
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg',
  // documents
  pdf: 'application/pdf',
  zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar', gz: 'application/gzip', tar: 'application/x-tar',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

export const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'swift', 'm', 'php', 'pl', 'lua', 'r', 'dart', 'scala',
  'sh', 'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd', 'sql', 'graphql', 'proto', 'gradle', 'properties', 'dockerfile', 'makefile',
  'gitignore', 'gitattributes', 'editorconfig', 'srt', 'vtt', 'tex', 'rst', 'diff', 'patch',
]);

// Types a browser may display inline safely (media is not scriptable; PDF runs in the
// browser's isolated viewer). SVG is allowed only under a sandbox CSP.
const INLINE_OK = /^(image\/(png|jpeg|gif|webp|avif|bmp|x-icon|svg\+xml)|video\/|audio\/|application\/pdf$)/;

export function extOf(name) {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) return lower === 'dockerfile' || lower === 'makefile' ? lower : '';
  return lower.slice(dot + 1);
}

export function contentTypeFor(name) {
  const ext = extOf(name);
  if (TYPES[ext]) return TYPES[ext];
  if (TEXT_EXTS.has(ext)) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

export function inlineAllowed(type) {
  return INLINE_OK.test(type) || type.startsWith('text/plain');
}
