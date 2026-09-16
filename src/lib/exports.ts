import type { Transaction, Category, Account } from "@/hooks/useFinance";
import { format } from "date-fns";

function tableRows(txs: Transaction[], cats: Category[], accs: Account[]) {
  const cmap = new Map(cats.map((c) => [c.id, c.name]));
  const amap = new Map(accs.map((a) => [a.id, a.name]));
  return txs.map((t) => ({
    Date: format(new Date(t.occurred_at), "yyyy-MM-dd HH:mm"),
    Type: t.type,
    Amount: t.amount,
    Category: t.category_id ? cmap.get(t.category_id) ?? "" : "",
    Account: t.account_id ? amap.get(t.account_id) ?? "" : "",
    Vendor: t.vendor ?? "",
    Note: t.notes ?? "",
    Status: t.status,
  }));
}

export function exportCSV(txs: Transaction[], cats: Category[], accs: Account[]) {
  const rows = tableRows(txs, cats, accs);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(",")),
  ].join("\n");
  downloadBlob(csv, "transactions.csv", "text/csv");
}

export async function exportExcel(txs: Transaction[], cats: Category[], accs: Account[]) {
  const XLSX = await import("xlsx");
  const rows = tableRows(txs, cats, accs);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, "transactions.xlsx");
}

export async function exportPDF(txs: Transaction[], cats: Category[], accs: Account[], currency = "USD") {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("Transactions Report", 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated ${format(new Date(), "PPP")}  •  Currency: ${currency}`, 14, 26);
  const rows = tableRows(txs, cats, accs);
  autoTable(doc, {
    startY: 32,
    head: [Object.keys(rows[0] ?? { Date: "", Type: "", Amount: "", Category: "", Account: "", Vendor: "", Description: "", Status: "" })],
    body: rows.map((r) => Object.values(r).map((v) => String(v))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [255, 90, 95] },
  });
  doc.save("transactions.pdf");
}

export function exportJSON(data: unknown, filename = "backup.json") {
  downloadBlob(JSON.stringify(data, null, 2), filename, "application/json");
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}