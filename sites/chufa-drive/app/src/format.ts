import type { Entry } from './api';

export function fmtBytes(n: number | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : digits)} ${units[i]}`;
}

/** Explorer shows sizes in KB with thousands separators in Details view. */
export function fmtKB(n: number): string {
  return `${Math.ceil(n / 1024).toLocaleString('zh-CN')} KB`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateLong(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--';
  if (sec < 60) return `${Math.ceil(sec)} 秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒`;
  return `${Math.floor(sec / 3600)} 小时 ${Math.round((sec % 3600) / 60)} 分`;
}

export type Kind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'archive'
  | 'code'
  | 'text'
  | 'markdown'
  | 'data'
  | 'font'
  | 'exe'
  | 'file';

const KINDS: Record<string, Kind> = {};
const reg = (kind: Kind, exts: string) => exts.split(' ').forEach((e) => (KINDS[e] = kind));
reg('image', 'png jpg jpeg jfif gif webp avif bmp ico svg heic heif tif tiff psd raw cr2 nef arw');
reg('video', 'mp4 m4v webm mov ogv mkv avi wmv flv 3gp ts m2ts');
reg('audio', 'mp3 m4a aac wav flac ogg oga opus wma aiff mid midi');
reg('pdf', 'pdf');
reg('word', 'doc docx odt rtf pages');
reg('excel', 'xls xlsx xlsm ods numbers');
reg('ppt', 'ppt pptx odp key');
reg('archive', 'zip 7z rar gz tgz bz2 xz tar zst lz iso dmg cab');
reg('code', 'js mjs cjs jsx ts tsx vue svelte py rb go rs java kt kts c h cc cpp hpp cs swift m php pl lua r dart scala sh bash zsh ps1 psm1 bat cmd sql graphql proto gradle html htm css scss less xml dockerfile makefile');
reg('text', 'txt log ini cfg conf env srt vtt tex rst diff patch properties gitignore gitattributes editorconfig');
reg('markdown', 'md markdown');
reg('data', 'json jsonl yaml yml toml csv tsv');
reg('font', 'ttf otf woff woff2');
reg('exe', 'exe msi apk dll app deb rpm');

export function extOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) return lower === 'dockerfile' || lower === 'makefile' ? lower : '';
  return lower.slice(dot + 1);
}

export function kindOf(e: Pick<Entry, 'name' | 'type'>): Kind {
  if (e.type === 'dir') return 'folder';
  return KINDS[extOf(e.name)] ?? 'file';
}

const KIND_LABEL: Record<Kind, string> = {
  folder: '文件夹',
  image: '图片',
  video: '视频',
  audio: '音频',
  pdf: 'PDF 文档',
  word: 'Word 文档',
  excel: 'Excel 工作表',
  ppt: '演示文稿',
  archive: '压缩文件',
  code: '源代码',
  text: '文本文档',
  markdown: 'Markdown 文档',
  data: '数据文件',
  font: '字体文件',
  exe: '应用程序',
  file: '文件',
};

export function typeLabel(e: Pick<Entry, 'name' | 'type'>): string {
  if (e.type === 'dir') return '文件夹';
  const ext = extOf(e.name);
  const kind = kindOf(e);
  if (kind === 'file') return ext ? `${ext.toUpperCase()} 文件` : '文件';
  if (kind === 'image' || kind === 'video' || kind === 'audio') return `${ext.toUpperCase()} ${KIND_LABEL[kind]}`;
  return KIND_LABEL[kind];
}

/** What the built-in viewer can show. */
export type PreviewMode = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'markdown' | 'table' | 'json' | 'none';

const BROWSER_IMAGES = new Set(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']);
const BROWSER_VIDEO = new Set(['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv']);
const BROWSER_AUDIO = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus']);

export function previewMode(e: Pick<Entry, 'name' | 'type'>): PreviewMode {
  if (e.type === 'dir') return 'none';
  const ext = extOf(e.name);
  if (BROWSER_IMAGES.has(ext)) return 'image';
  if (BROWSER_VIDEO.has(ext)) return 'video';
  if (BROWSER_AUDIO.has(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'csv' || ext === 'tsv') return 'table';
  if (ext === 'json') return 'json';
  const kind = kindOf(e);
  if (kind === 'code' || kind === 'text' || kind === 'data') return 'text';
  return 'none';
}


// ---------- sorting ----------
export type SortKey = 'name' | 'mtime' | 'type' | 'size' | 'ctime';
export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

const collator = new Intl.Collator(['zh-Hans-CN', 'en', 'ja'], { numeric: true, sensitivity: 'base' });

export function sortEntries(list: Entry[], sort: SortState): Entry[] {
  const cmpName = (a: Entry, b: Entry) => collator.compare(a.name, b.name);
  const cmp = (a: Entry, b: Entry): number => {
    // folders first, like Explorer
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let r = 0;
    switch (sort.key) {
      case 'name':
        r = cmpName(a, b);
        break;
      case 'mtime':
        r = a.mtime - b.mtime;
        break;
      case 'ctime':
        r = a.ctime - b.ctime;
        break;
      case 'size':
        r = a.type === 'dir' ? (a.items ?? 0) - (b.items ?? 0) : a.size - b.size;
        break;
      case 'type':
        r = collator.compare(typeLabel(a), typeLabel(b)) || collator.compare(extOf(a.name), extOf(b.name));
        break;
    }
    return (r || cmpName(a, b)) * sort.dir;
  };
  return [...list].sort(cmp);
}

export const SORT_LABELS: Record<SortKey, string> = {
  name: '名称',
  mtime: '修改日期',
  type: '类型',
  size: '大小',
  ctime: '创建日期',
};

/** "剩余 3 天" / "已过期" / "永久有效" */
export function fmtExpiry(expiresAt: number | null, now = Date.now()): { text: string; expired: boolean; soon: boolean } {
  if (expiresAt == null) return { text: '永久有效', expired: false, soon: false };
  const left = expiresAt - now;
  if (left <= 0) return { text: '已过期', expired: true, soon: false };
  const min = Math.ceil(left / 60_000);
  let text: string;
  if (min < 60) text = `剩余 ${min} 分钟`;
  else if (min < 48 * 60) text = `剩余 ${Math.floor(min / 60)} 小时${min % 60 && min < 6 * 60 ? ` ${min % 60} 分` : ''}`;
  else text = `剩余 ${Math.floor(min / 1440)} 天`;
  return { text, expired: false, soon: left < 3_600_000 };
}
