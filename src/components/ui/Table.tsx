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
      <div className="py-12 text-center text-sm text-neutral-400">Loading...</div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-neutral-400">{emptyMessage}</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            {columns.map(col => (
              <th key={col.key} className={`text-left py-3 px-4 text-xs font-medium text-neutral-500 uppercase tracking-wide ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-neutral-50 transition-colors">
              {columns.map(col => (
                <td key={col.key} className={`py-3.5 px-4 text-neutral-700 ${col.className || ''}`}>
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
