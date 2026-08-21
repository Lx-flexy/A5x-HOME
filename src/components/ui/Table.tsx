import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  loading?: boolean;
}

export default function Table<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data found.',
  loading = false,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
            {columns.map(col => (
              <th key={col.key} className={`text-left py-3 px-4 text-xs font-medium uppercase tracking-wide ${col.className || ''}`} style={{ color: 'var(--text-secondary)' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
          {data.map((row, i) => (
            <tr key={i} className="transition-colors hover:opacity-80" style={{ borderBottom: '1px solid var(--border-color)' }}>
              {columns.map(col => (
                <td key={col.key} className={`py-3.5 px-4 ${col.className || ''}`} style={{ color: 'var(--text-primary)' }}>
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
