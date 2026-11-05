import { WORLDZ_W_BODY, WORLDZ_W_SIGNAL } from "../brand";
import { NEAR_EXPLORER_URL } from "./config";
import { getReceiptDetails, type ReceiptOrder } from "./receipt-details";

export type { ReceiptOrder } from "./receipt-details";

export async function createReceiptPdf(order: ReceiptOrder) {
  if (!order.settlementReceiptId) throw new Error("A verified settlement receipt is required.");
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { amount, date, rows } = getReceiptDetails(order);
  const ink = "#0b0f0e", paper = "#f2efe6", grey = "#8c9189", line = "#d8d4c6";
  doc.setProperties({ title: `Payment receipt - ${order.orderId}`, author: "WorldzPayments", subject: "Verified NEAR payment settlement" });
  const pageBackground = () => { doc.setFillColor(paper); doc.rect(0, 0, 210, 297, "F"); };
  pageBackground();
  // Match the displayed receipt: logo, settled status, amount, date, then shared detail rows.
  doc.setFillColor("#07382e"); doc.roundedRect(22, 16, 166, 79, 5, 5, "F");
  const drawMark = (vertices: readonly (readonly [number, number])[], color: string) => {
    const scale = 0.15;
    const [firstX, firstY] = vertices[0];
    const segments = vertices.slice(1).map(([x, y], index) => [
      (x - vertices[index][0]) * scale,
      (y - vertices[index][1]) * scale,
    ]);
    doc.setFillColor(color);
    doc.lines(segments, 29 + firstX * scale, 23 + firstY * scale, [1, 1], "F", true);
  };
  drawMark(WORLDZ_W_BODY, paper); drawMark(WORLDZ_W_SIGNAL, "#12e08a");
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(paper); doc.text("worldzPayments", 41, 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text("RECEIPT", 180, 30, { align: "right" });
  doc.setFillColor("#12e08a"); doc.circle(105, 46, 5, "F");
  doc.setDrawColor(ink); doc.setLineWidth(.6); doc.lines([[1.5, 1.5], [3, -3.5]], 102.7, 46, [1, 1], "S");
  doc.setTextColor("#12e08a"); doc.setFontSize(11); doc.text("Payment settled", 105, 60, { align: "center" });
  doc.setTextColor(paper); doc.setFont("courier", "bold"); doc.setFontSize(25);
  if (doc.getTextWidth(amount) > 150) doc.setFontSize(Math.max(10, 25 * 150 / doc.getTextWidth(amount)));
  doc.text(doc.splitTextToSize(amount, 150), 105, 74, { align: "center" });
  if (date) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(date, 105, 87, { align: "center" }); }
  let y = 108;
  for (const { label, value, mono } of rows) {
    doc.setFont(mono ? "courier" : "helvetica", "normal"); doc.setFontSize(9);
    const lines: string[] = doc.splitTextToSize(value, 100);
    const height = Math.max(12, lines.length * 4.5 + 7);
    if (y + height > 254) { doc.addPage(); pageBackground(); y = 25; }
    doc.setFont("helvetica", "normal"); doc.setTextColor(grey); doc.text(label, 22, y);
    doc.setFont(mono ? "courier" : "helvetica", "normal"); doc.setTextColor(ink); doc.text(lines, 188, y, { align: "right" });
    doc.setDrawColor(line); doc.setLineWidth(.2); doc.line(22, y + height - 5, 188, y + height - 5);
    y += height;
  }
  if (y > 235) { doc.addPage(); pageBackground(); y = 25; }
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(grey);
  doc.text("Settlement verified by the merchant service", 105, y + 3, { align: "center" });
  if (order.transactionHash) {
    doc.setTextColor("#0bb06b"); doc.setFontSize(9);
    doc.textWithLink("View on NEAR Explorer", 22, y + 14, { url: `${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(order.transactionHash)}` });
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setDrawColor(line); doc.line(22, 275, 188, 275);
    doc.setFont("helvetica", "normal"); doc.setTextColor(grey); doc.setFontSize(8);
    doc.text("WorldzPayments | Your payments. Your wallet.", 22, 282);
    doc.text(`${page} / ${pages}`, 188, 282, { align: "right" });
  }
  return doc;
}
