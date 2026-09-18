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

export type PartnerActivityExportRow = {
  Date: string;
  Type: string;
  Amount: number;
  Category: string;
  Subcategory: string;
  Details: string;
  Account: string;
  Project: string;
};

function safeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "project";
}

export function exportPartnerActivityCSV(rows: PartnerActivityExportRow[], projectName: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => JSON.stringify((row as Record<string, unknown>)[header] ?? ""))
        .join(","),
    ),
  ].join("\n");
  downloadBlob(
    csv,
    `${safeFilenamePart(projectName)}-partner-activity.csv`,
    "text/csv",
  );
}

export async function exportPartnerActivityExcel(rows: PartnerActivityExportRow[], projectName: string) {
  if (rows.length === 0) return;
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 24 },
    { wch: 48 },
    { wch: 22 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Partner Activity");
  XLSX.writeFile(wb, `${safeFilenamePart(projectName)}-partner-activity.xlsx`);
}

export async function exportPartnerActivityPDF(
  rows: PartnerActivityExportRow[],
  projectName: string,
  currency = "INR",
) {
  if (rows.length === 0) return;
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(17);
  doc.text("Partner Activity", 14, 16);
  doc.setFontSize(10);
  doc.text(projectName, 14, 23);
  doc.text(`Generated ${format(new Date(), "PPP")}  •  Currency: ${currency}`, 14, 29);

  const headers = ["Date", "Type", "Amount", "Category", "Subcategory", "Details", "Account", "Project"];
  autoTable(doc, {
    startY: 35,
    head: [headers],
    body: rows.map((row) => [
      row.Date,
      row.Type,
      String(row.Amount),
      row.Category,
      row.Subcategory,
      row.Details,
      row.Account,
      row.Project,
    ]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [255, 90, 95] },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 28 },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 28 },
      4: { cellWidth: 34 },
      5: { cellWidth: 72 },
      6: { cellWidth: 34 },
      7: { cellWidth: 38 },
    },
  });

  doc.save(`${safeFilenamePart(projectName)}-partner-activity.pdf`);
}
