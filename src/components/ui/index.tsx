import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { AlertCircle, CheckCircle2, Info, Shield } from 'lucide-react';
import { getAssetUrl } from '../../services/assets';
import { useApp } from '../../store/appStore';

/* ---------- asset URLs ---------- */

export function useAssetUrl(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) setUrl(null);
    else getAssetUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function LogoImg({ assetId, size = 'md' }: { assetId: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const url = useAssetUrl(assetId);
  const cls = size === 'sm' ? 'logo-box sm' : 'logo-box';
  const style = size === 'lg' ? { width: 80, height: 80 } : undefined;
  if (!url)
    return (
      <div className={`${cls} empty-logo`} style={style}>
        <Shield size={size === 'sm' ? 14 : 22} />
      </div>
    );
  return (
    <div className={cls} style={style}>
      <img src={url} alt="" draggable={false} />
    </div>
  );
}

/* ---------- modal ---------- */

export function Modal({ title, children, onClose, width }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------- confirm / prompt dialogs (no native browser dialogs) ---------- */

interface DialogReq {
  kind: 'confirm' | 'prompt';
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (v: any) => void;
}

const useDialogStore = create<{ req: DialogReq | null }>(() => ({ req: null }));

export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useDialogStore.setState({ req: { kind: 'confirm', ...opts, resolve } }));
}

export function promptDialog(opts: { title: string; message?: string; defaultValue?: string; confirmLabel?: string }): Promise<string | null> {
  return new Promise((resolve) => useDialogStore.setState({ req: { kind: 'prompt', ...opts, resolve } }));
}

export function DialogHost() {
  const req = useDialogStore((s) => s.req);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (req?.kind === 'prompt') {
      setValue(req.defaultValue ?? '');
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [req]);
  if (!req) return null;
  const close = (v: any) => {
    useDialogStore.setState({ req: null });
    req.resolve(v);
  };
  const cancelValue = req.kind === 'confirm' ? false : null;
  const ok = () => {
    if (req.kind === 'prompt') {
      if (!value.trim()) return;
      close(value.trim());
    } else close(true);
  };
  return (
    <Modal title={req.title} onClose={() => close(cancelValue)}>
      {req.message && <p className="muted" style={{ margin: '0 0 12px', lineHeight: 1.5 }}>{req.message}</p>}
      {req.kind === 'prompt' && (
        <input
          ref={inputRef}
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
          autoFocus
        />
      )}
      <div className="modal-actions">
        <button className="btn" onClick={() => close(cancelValue)}>
          Annulla
        </button>
        <button className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={ok} autoFocus={req.kind === 'confirm'}>
          {req.confirmLabel ?? 'Conferma'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- toasts ---------- */

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.kind === 'success' ? (
            <CheckCircle2 size={16} color="var(--ok)" />
          ) : t.kind === 'error' ? (
            <AlertCircle size={16} color="var(--danger)" />
          ) : (
            <Info size={16} color="var(--muted)" />
          )}
          <span style={{ lineHeight: 1.45 }}>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- numeric field with drag-to-change label ---------- */

export function NumField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  decimals = 0,
  disabled,
  title,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  disabled?: boolean;
  title?: string;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(decimals).replace(/\.0+$/, '') : '');
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (raw: string) => {
    const v = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(v)) onChange(clamp(v));
    else setText(fmt(value));
  };
  const onDrag = (e: React.PointerEvent) => {
    if (disabled) return;
    const startX = e.clientX;
    const start = value;
    const move = (ev: PointerEvent) => onChange(clamp(start + Math.round((ev.clientX - startX) / 2) * step));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="num" title={title} style={disabled ? { opacity: 0.5 } : undefined}>
      <span onPointerDown={onDrag}>{label}</span>
      <input
        value={text}
        disabled={disabled}
        onFocus={() => (focused.current = true)}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const v = clamp(value + d);
            onChange(v);
            setText(fmt(v));
          }
        }}
      />
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider-row">
      <span className="label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="val">{format ? format(value) : value}</span>
    </div>
  );
}

export function Dropzone({ onFiles, accept, children }: { onFiles: (files: File[]) => void; accept: string; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}
