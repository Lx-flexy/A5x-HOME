import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownProps {
  isOpen: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  className?: string;
}

export default function Dropdown({ isOpen, onClose, anchor, children, className = '' }: DropdownProps) {
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !anchor.current || !dropdownRef.current) return;

    const updatePosition = () => {
      const anchorRect = anchor.current!.getBoundingClientRect();
      const dropdownRect = dropdownRef.current!.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let top = anchorRect.bottom + 4; // 4px gap below anchor
      let left = anchorRect.right - dropdownRect.width; // Align right edge with anchor

      // Check if dropdown would go below viewport
      if (top + dropdownRect.height > viewportHeight - 10) {
        // Position above the anchor
        top = anchorRect.top - dropdownRect.height - 4;
      }

      // Check if dropdown would go outside left edge
      if (left < 10) {
        left = 10;
      }

      // Check if dropdown would go outside right edge
      if (left + dropdownRect.width > viewportWidth - 10) {
        left = viewportWidth - dropdownRect.width - 10;
      }

      // Calculate max height to fit in viewport
      const maxHeight = Math.min(300, viewportHeight - top - 20);

      setPosition({ top, left, maxHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchor]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        anchor.current &&
        !anchor.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchor]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={`fixed bg-white border border-neutral-200 rounded-xl shadow-lg py-1 min-w-[12rem] ${className}`}
      style={{
        top: position.top,
        left: position.left,
        maxHeight: position.maxHeight,
        zIndex: 9999,
        overflowY: 'auto',
      }}
    >
      {children}
    </div>,
    document.body
  );
}

interface DropdownItemProps {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export function DropdownItem({ onClick, icon, children, variant = 'default', disabled = false }: DropdownItemProps) {
  const handleClick = () => {
    if (!disabled) {
      onClick();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-xs transition-colors text-left ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : variant === 'danger'
          ? 'text-red-600 hover:bg-red-50'
          : 'text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function DropdownDivider() {
  return <div className="border-t border-neutral-100 my-1" />;
}