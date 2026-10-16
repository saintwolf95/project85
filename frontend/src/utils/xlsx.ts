import ExcelJS from 'exceljs';

type SpreadsheetValue = string | number | boolean | null | undefined;
type SpreadsheetRow = Record<string, SpreadsheetValue>;

/** Genera un XLSX local para exportaciones que ya fueron autorizadas en la UI. */
export const downloadXlsx = async (rows: SpreadsheetRow[], sheetName: string, fileName: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  worksheet.columns = columns.map(key => ({ header: key, key, width: Math.min(42, Math.max(14, key.length + 2)) }));
  rows.forEach(row => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
