import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div 
        className={`relative rounded-2xl shadow-xl w-full ${sizes[size]} z-10 transition-colors duration-200 max-h-[90vh] overflow-y-auto`}
        style={{ 
          background: 'var(--bg-primary)',
          boxShadow: 'var(--neo-shadow-lg)'
        }}
      >
        {title && (
          <div 
            className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 transition-colors duration-200" 
            style={{ borderBottom: '1px solid var(--border-color)' }}
          >
            <h3 className="font-semibold text-sm md:text-base truncate pr-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <button 
              onClick={onClose} 
              className="p-2 rounded-lg transition-all duration-200 hover:opacity-70 flex-shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
              style={{ 
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                touchAction: 'manipulation'
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="px-4 md:px-6 py-4 md:py-5">{children}</div>
      </div>
    </div>
  );
}
