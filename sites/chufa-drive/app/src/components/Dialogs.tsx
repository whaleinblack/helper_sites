import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, CopyPlus, FolderPlus, HardDrive, KeyRound, Keyboard, Replace, SkipForward, Trash2 } from 'lucide-react';
import { api, ApiError, joinPath, parentOf, segmentsOf, type ConflictMode, type Entry, type EntryType, type Props } from '../api';
import { fmtBytes, fmtDateLong, typeLabel } from '../format';
import { FileIcon, FolderIcon } from './FileIcon';
import { Modal } from './Modal';
import { ShareDialog } from './ShareDialog';

type Spec =
  | { kind: 'confirm'; title: string; message: ReactNode; confirmText: string; danger?: boolean; resolve: (ok: boolean) => void }
  | {
      kind: 'prompt';
      title: string;
      label: string;
      value: string;
      confirmText: string;
      selectStem?: boolean;
      resolve: (v: string | null) => void;
    }
  | { kind: 'conflict'; names: string[]; action: string; resolve: (m: ConflictMode | null) => void }
  | { kind: 'folder'; title: string; confirmText: string; start: string; exclude: string[]; resolve: (p: string | null) => void }
  | { kind: 'props'; paths: string[] }
  | { kind: 'password' }
  | { kind: 'shortcuts' }
  | { kind: 'share'; paths: string[]; names: string[]; types: EntryType[]; onManage: () => void };

type Opener = {
  confirm: (o: { title: string; message: ReactNode; confirmText?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (o: { title: string; label: string; value?: string; confirmText?: string; selectStem?: boolean }) => Promise<string | null>;
  conflict: (names: string[], action: string) => Promise<ConflictMode | null>;
  pickFolder: (o: { title: string; confirmText: string; start: string; exclude?: string[] }) => Promise<string | null>;
  props: (paths: string[]) => void;
  password: () => void;
  shortcuts: () => void;
  share: (o: { paths: string[]; names: string[]; types: EntryType[]; onManage: () => void }) => void;
  open: boolean;
};

const Ctx = createContext<Opener | null>(null);
export const useDialogs = () => useContext(Ctx)!;

export function DialogProvider({ children, notify }: { children: ReactNode; notify: (msg: string, tone?: 'ok' | 'error') => void }) {
  const [spec, setSpec] = useState<Spec | null>(null);
  const close = () => setSpec(null);

  const confirm = useCallback<Opener['confirm']>(
    (o) => new Promise((resolve) => setSpec({ kind: 'confirm', confirmText: '确定', ...o, resolve })),
    [],
  );
  const prompt = useCallback<Opener['prompt']>(
    (o) => new Promise((resolve) => setSpec({ kind: 'prompt', value: '', confirmText: '确定', ...o, resolve })),
    [],
  );
  const conflict = useCallback<Opener['conflict']>(
    (names, action) => new Promise((resolve) => setSpec({ kind: 'conflict', names, action, resolve })),
    [],
  );
  const pickFolder = useCallback<Opener['pickFolder']>(
    (o) => new Promise((resolve) => setSpec({ kind: 'folder', exclude: [], ...o, resolve })),
    [],
  );
  const props = useCallback((paths: string[]) => setSpec({ kind: 'props', paths }), []);
  const password = useCallback(() => setSpec({ kind: 'password' }), []);
  const shortcuts = useCallback(() => setSpec({ kind: 'shortcuts' }), []);
  const share = useCallback<Opener['share']>((o) => setSpec({ kind: 'share', ...o }), []);

  const value = useMemo(
    () => ({ confirm, prompt, conflict, pickFolder, props, password, shortcuts, share, open: spec !== null }),
    [confirm, prompt, conflict, pickFolder, props, password, shortcuts, share, spec],
  );

  let dialog: ReactNode = null;
  if (spec?.kind === 'confirm') {
    const done = (ok: boolean) => {
      close();
      spec.resolve(ok);
    };
    dialog = (
      <Modal
        title={spec.title}
        onClose={() => done(false)}
        icon={spec.danger ? <Trash2 size={18} /> : undefined}
        footer={
          <>
            <button className="btn" onClick={() => done(false)}>
              取消
            </button>
            <button className={`btn primary ${spec.danger ? 'danger' : ''}`} data-autofocus onClick={() => done(true)}>
              {spec.confirmText}
            </button>
          </>
        }
      >
        <div className="modal-message">{spec.message}</div>
      </Modal>
    );
  } else if (spec?.kind === 'prompt') {
    dialog = <PromptDialog spec={spec} close={close} />;
  } else if (spec?.kind === 'conflict') {
    const done = (m: ConflictMode | null) => {
      close();
      spec.resolve(m);
    };
    const shown = spec.names.slice(0, 6);
    dialog = (
      <Modal title={`${spec.action}时发现同名项目`} onClose={() => done(null)} icon={<AlertTriangle size={18} />} width={480}>
        <p className="modal-message">
          目标位置已包含 {spec.names.length} 个同名项目：
        </p>
        <ul className="conflict-list">
          {shown.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {spec.names.length > shown.length && <li className="muted">以及另外 {spec.names.length - shown.length} 项…</li>}
        </ul>
        <div className="choice-list">
          <button className="choice" data-autofocus onClick={() => done('overwrite')}>
            <Replace size={20} />
            <span>
              <strong>替换目标中的项目</strong>
              <small>被替换的旧版本会移入回收站，可以还原</small>
            </span>
          </button>
          <button className="choice" onClick={() => done('skip')}>
            <SkipForward size={20} />
            <span>
              <strong>跳过这些项目</strong>
              <small>只处理没有冲突的项目</small>
            </span>
          </button>
          <button className="choice" onClick={() => done('rename')}>
            <CopyPlus size={20} />
            <span>
              <strong>保留两者</strong>
              <small>新项目自动命名为“名称 (2)”</small>
            </span>
          </button>
        </div>
      </Modal>
    );
  } else if (spec?.kind === 'folder') {
    dialog = <FolderPicker spec={spec} close={close} notify={notify} />;
  } else if (spec?.kind === 'props') {
    dialog = <PropsDialog paths={spec.paths} close={close} />;
  } else if (spec?.kind === 'password') {
    dialog = <PasswordDialog close={close} notify={notify} />;
  } else if (spec?.kind === 'shortcuts') {
    dialog = <ShortcutsDialog close={close} />;
  } else if (spec?.kind === 'share') {
    dialog = <ShareDialog paths={spec.paths} names={spec.names} types={spec.types} onManage={spec.onManage} close={close} />;
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {dialog}
    </Ctx.Provider>
  );
}

function PromptDialog({ spec, close }: { spec: Extract<Spec, { kind: 'prompt' }>; close: () => void }) {
  const [value, setValue] = useState(spec.value);
  const done = (v: string | null) => {
    close();
    spec.resolve(v);
  };
  const invalid = /[\\/]/.test(value) ? '名称不能包含 / 或 \\' : '';
  return (
    <Modal
      title={spec.title}
      onClose={() => done(null)}
      footer={
        <>
          <button className="btn" onClick={() => done(null)}>
            取消
          </button>
          <button className="btn primary" disabled={!value.trim() || !!invalid} onClick={() => done(value.trim())}>
            {spec.confirmText}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{spec.label}</span>
        <input
          value={value}
          autoFocus
          spellCheck={false}
          onFocus={(e) => {
            if (!spec.selectStem) return e.currentTarget.select();
            const dot = value.lastIndexOf('.');
            e.currentTarget.setSelectionRange(0, dot > 0 ? dot : value.length);
          }}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim() && !invalid) done(value.trim());
          }}
        />
        {invalid && <em className="field-error">{invalid}</em>}
      </label>
    </Modal>
  );
}

function FolderPicker({
  spec,
  close,
  notify,
}: {
  spec: Extract<Spec, { kind: 'folder' }>;
  close: () => void;
  notify: (m: string, t?: 'ok' | 'error') => void;
}) {
  const [path, setPath] = useState(spec.start);
  const [dirs, setDirs] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const done = (p: string | null) => {
    close();
    spec.resolve(p);
  };
  useEffect(() => {
    const ac = new AbortController();
    setDirs(null);
    setError('');
    api
      .list(path, ac.signal)
      .then((r) => setDirs(r.entries.filter((e) => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))))
      .catch((e) => {
        if (e.name === 'AbortError') return;
        if (e instanceof ApiError && e.status === 404 && path !== '/') setPath('/');
        else setError(e.message);
      });
    return () => ac.abort();
  }, [path, reload]);
  const blocked = spec.exclude.some((x) => path === x || path.startsWith(`${x}/`));
  const segs = segmentsOf(path);
  const newFolder = async () => {
    const name = window.prompt('新文件夹名称', '新建文件夹');
    if (!name) return;
    try {
      await api.mkdir(path, name);
      setReload((n) => n + 1);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <Modal
      title={spec.title}
      onClose={() => done(null)}
      width={520}
      footer={
        <>
          <button className="btn ghost-left" onClick={newFolder}>
            <FolderPlus size={16} /> 新建文件夹
          </button>
          <button className="btn" onClick={() => done(null)}>
            取消
          </button>
          <button className="btn primary" disabled={blocked} onClick={() => done(path)}>
            {spec.confirmText}
          </button>
        </>
      }
    >
      <nav className="picker-crumbs" aria-label="位置">
        <button onClick={() => setPath('/')}>
          <HardDrive size={15} /> 我的网盘
        </button>
        {segs.map((s, i) => (
          <span key={i} className="crumb-part">
            <ChevronRight size={14} />
            <button onClick={() => setPath('/' + segs.slice(0, i + 1).join('/'))}>{s}</button>
          </span>
        ))}
      </nav>
      <div className="picker-list" role="listbox">
        {path !== '/' && (
          <button className="picker-item up" onDoubleClick={() => setPath(parentOf(path))} onClick={() => setPath(parentOf(path))}>
            <span className="picker-up">..</span> 返回上一级
          </button>
        )}
        {error && <div className="picker-empty error">{error}</div>}
        {!dirs && !error && <div className="picker-empty">正在加载…</div>}
        {dirs?.length === 0 && <div className="picker-empty">此文件夹中没有子文件夹</div>}
        {dirs?.map((d) => {
          const p = joinPath(path, d.name);
          const excluded = spec.exclude.includes(p);
          return (
            <button key={d.name} className="picker-item" disabled={excluded} onClick={() => setPath(p)}>
              <FolderIcon size={22} filled={(d.items ?? 0) > 0} />
              <span>{d.name}</span>
              {d.hasDirs && <ChevronRight size={15} className="muted" />}
            </button>
          );
        })}
      </div>
      {blocked && <p className="field-error">不能移动或复制到所选文件夹自身内部</p>}
    </Modal>
  );
}

function PropsDialog({ paths, close }: { paths: string[]; close: () => void }) {
  const [data, setData] = useState<Props[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all(paths.map((p) => api.props(p)))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [paths]);
  const single = data?.length === 1 ? data[0] : null;
  const total = data?.reduce((s, p) => s + (p.type === 'dir' ? (p.bytes ?? 0) : p.size), 0) ?? 0;
  const files = data?.reduce((s, p) => s + (p.type === 'dir' ? (p.files ?? 0) : 1), 0) ?? 0;
  const dirs = data?.reduce((s, p) => s + (p.type === 'dir' ? (p.dirs ?? 0) + 1 : 0), 0) ?? 0;
  const title = single ? `${single.name} 属性` : `${paths.length} 个项目的属性`;
  return (
    <Modal title={title} onClose={close} width={460} footer={<button className="btn primary" onClick={close}>确定</button>}>
      {error && <p className="field-error">{error}</p>}
      {!data && !error && <p className="muted">正在计算…</p>}
      {data && (
        <div className="props">
          <div className="props-head">
            {single ? <FileIcon entry={single} size={48} /> : <FileIcon entry={{ name: '', type: 'dir', items: 1 }} size={48} />}
            <strong>{single ? single.name : `${data.length} 个项目`}</strong>
          </div>
          <dl>
            {single && (
              <>
                <dt>类型</dt>
                <dd>{typeLabel(single)}</dd>
                <dt>位置</dt>
                <dd className="mono">{parentOf(single.path)}</dd>
              </>
            )}
            <dt>大小</dt>
            <dd>
              {fmtBytes(total, 2)} <span className="muted">（{total.toLocaleString('zh-CN')} 字节）</span>
            </dd>
            {(!single || single.type === 'dir') && (
              <>
                <dt>包含</dt>
                <dd>
                  {files.toLocaleString('zh-CN')} 个文件，{Math.max(0, single ? dirs - 1 : dirs).toLocaleString('zh-CN')} 个文件夹
                </dd>
              </>
            )}
            {single && (
              <>
                <dt>创建时间</dt>
                <dd>{fmtDateLong(single.ctime)}</dd>
                <dt>修改时间</dt>
                <dd>{fmtDateLong(single.mtime)}</dd>
                <dt>访问时间</dt>
                <dd>{fmtDateLong(single.atime)}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </Modal>
  );
}

function PasswordDialog({ close, notify }: { close: () => void; notify: (m: string, t?: 'ok' | 'error') => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 10) return setError('新密码至少 10 个字符');
    if (next !== again) return setError('两次输入的新密码不一致');
    setBusy(true);
    try {
      await api.password(current, next);
      notify('密码已修改，其他设备上的登录已失效', 'ok');
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="修改密码" onClose={close} icon={<KeyRound size={18} />}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>当前密码</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-autofocus />
        </label>
        <label className="field">
          <span>新密码（至少 10 个字符）</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="field">
          <span>确认新密码</span>
          <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {error && <p className="field-error">{error}</p>}
        <div className="modal-foot inline">
          <button type="button" className="btn" onClick={close}>
            取消
          </button>
          <button className="btn primary" disabled={busy || !current || !next}>
            {busy ? '正在保存…' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl + A', '全选'],
  ['Ctrl / Shift + 单击', '多选 / 连续选择'],
  ['在空白处拖动', '框选'],
  ['Enter', '打开'],
  ['空格', '快速预览'],
  ['F2', '重命名'],
  ['Delete', '删除到回收站'],
  ['Shift + Delete', '永久删除'],
  ['Ctrl + C / X / V', '复制 / 剪切 / 粘贴'],
  ['Ctrl + Shift + N', '新建文件夹'],
  ['Ctrl + U', '上传文件'],
  ['Ctrl + F', '搜索'],
  ['Alt + ← / →', '后退 / 前进'],
  ['Alt + ↑ 或 Backspace', '上一级'],
  ['F5', '刷新'],
  ['Alt + P', '预览窗格'],
  ['Ctrl + 滚轮', '缩放图标'],
];

function ShortcutsDialog({ close }: { close: () => void }) {
  return (
    <Modal title="键盘快捷键" onClose={close} icon={<Keyboard size={18} />} width={480}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>
              {k.split(' ').map((p, i) => (p === '+' || p === '/' || p === '或' ? <span key={i}> {p} </span> : <kbd key={i}>{p}</kbd>))}
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
