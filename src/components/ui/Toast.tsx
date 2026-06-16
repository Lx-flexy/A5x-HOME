/**
 * Lightweight Toast notification system.
 * Usage:
 *   import { toast } from './Toast';
 *   toast.success('Saved!');
 *   toast.error('Something went wrong');
 *   toast.warning('Ad blocker detected');
 *   toast.info('Connecting...');
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, WifiOff } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

// Global toast queue
let _addToast: ((type: ToastType, message: string) => void) | null = null;
let _idCounter = 0;

export const toast = {
  success: (msg: string) => _addToast?.('success', msg),
  error:   (msg: string) => _addToast?.('error',   msg),
  warning: (msg: string) => _addToast?.('warning', msg),
  info:    (msg: string) => _addToast?.('info',    msg),
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-success-600 flex-shrink-0" />,
  error:   <AlertCircle  size={16} className="text-red-500 flex-shrink-0" />,
  warning: <WifiOff      size={16} className="text-yellow-500 flex-shrink-0" />,
  info:    <Info         size={16} className="text-primary-600 flex-shrink-0" />,
};

const STYLES: Record<ToastType, string> = {
  success: 'bg-white border-success-200 text-neutral-800',
  error:   'bg-white border-red-200 text-neutral-800',
  warning: 'bg-white border-yellow-200 text-neutral-800',
  info:    'bg-white border-primary-200 text-neutral-800',
};

function ToastItem({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(item.id), 4000);
    return () => clearTimeout(t);
  }, [item.id, onRemove]);

  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm max-w-xs w-full
      animate-in slide-in-from-right-5 fade-in-0 duration-200 ${STYLES[item.type]}`}>
      {ICONS[item.type]}
      <span className="flex-1 leading-snug">{item.message}</span>
      <button onClick={() => onRemove(item.id)} className="text-neutral-400 hover:text-neutral-600 flex-shrink-0 mt-0.5">
        <X size={13} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    _addToast = (type, message) => {
      const id = ++_idCounter;
      setToasts(prev => [...prev.slice(-4), { id, type, message }]);
    };
    return () => { _addToast = null; };
  }, []);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
      {toasts.map(t => <ToastItem key={t.id} item={t} onRemove={remove} />)}
    </div>
  );
}
