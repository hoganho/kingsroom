// src/components/ui/DataTable.tsx
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
}

export function DataTable<T>({ data, columns }: DataTableProps<T>) {
  const table = useReactTable<T>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel<T>(),
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
        {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
            {row.getVisibleCells().map((cell) => {
                const cellRenderer = cell.column.columnDef.cell;
                const ctx = cell.getContext();

                return (
                <td key={cell.id} className="px-4 py-2 whitespace-nowrap">
                    {cellRenderer
                    ? flexRender(cellRenderer, ctx)
                    : String(ctx.getValue() ?? '')}
                </td>
                );
            })}
            </tr>
        ))}

        {rows.length === 0 && (
            <tr>
            <td
                className="px-4 py-6 text-center text-sm text-gray-500"
                colSpan={columns.length}
            >
                No data available.
            </td>
            </tr>
        )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;