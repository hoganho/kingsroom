// src/components/ui/DataTable.tsx
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { cx } from "@/lib/utils"

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, any>[]
  className?: string
  onRowClick?: (row: T) => void
}

export function DataTable<T>({ data, columns, className, onRowClick }: DataTableProps<T>) {
  const table = useReactTable<T>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel<T>(),
  })

  const headerGroups = table.getHeaderGroups()
  const rows = table.getRowModel().rows

  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="min-w-full text-left text-sm">
        <thead>
          {headerGroups.map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cx(
                    "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide",
                    "text-gray-500 dark:text-gray-400",
                    "border-b border-gray-200 dark:border-gray-800"
                  )}
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
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className={cx(
                "hover:bg-gray-50 dark:hover:bg-gray-900/50",
                onRowClick && "cursor-pointer"
              )}
            >
              {row.getVisibleCells().map((cell) => {
                const cellRenderer = cell.column.columnDef.cell
                const ctx = cell.getContext()

                return (
                  <td
                    key={cell.id}
                    className={cx(
                      "whitespace-nowrap px-4 py-3",
                      "text-gray-900 dark:text-gray-50"
                    )}
                  >
                    {cellRenderer
                      ? flexRender(cellRenderer, ctx)
                      : String(ctx.getValue() ?? "")}
                  </td>
                )
              })}
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td
                className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                colSpan={columns.length}
              >
                No data available.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default DataTable