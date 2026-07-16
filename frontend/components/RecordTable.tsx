import type { TableRow } from "../lib/api";

type RecordTableProps = {
  rows: TableRow[];
  emptyText?: string;
};

export default function RecordTable({ rows, emptyText = "暂无记录" }: RecordTableProps) {
  if (!rows.length) {
    return <div className="muted">{emptyText}</div>;
  }

  const columns = Object.keys(rows[0].payload || {});

  return (
    <div className="record-table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.row_key || "row"}-${index}`}>
              {columns.map((column) => (
                <td key={column}>{row.payload[column] || "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
