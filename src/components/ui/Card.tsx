import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export default function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div 
      className={`rounded-xl transition-colors duration-200 ${padding ? 'p-4 sm:p-5' : ''} ${className}`}
      style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
      }}
    >
      {children}
    </div>
  );
}
