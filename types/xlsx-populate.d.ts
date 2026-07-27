declare module 'xlsx-populate' {
  type StyleName = string | Record<string, unknown>;
  type StyleNames = string[];

  interface Cell {
    value(): unknown;
    value(value: unknown): Cell;
    formula(): string | undefined;
    formula(formula: string): Cell;
    style(name: StyleNames): Record<string, unknown>;
    style(name: StyleName, value?: unknown): Cell;
    style(styles: Record<string, unknown>): Cell;
    hyperlink(): string | Record<string, unknown> | undefined;
    hyperlink(hyperlink: string | Record<string, unknown>): Cell;
    rowNumber(): number;
    columnNumber(): number;
  }

  interface Range {
    value(): unknown;
    value(value: unknown): Range;
    merged(merged?: boolean): Range;
    style(name: StyleNames): Record<string, unknown>;
    style(name: StyleName, value?: unknown): Range;
    style(styles: Record<string, unknown>): Range;
    startCell(): Cell;
    endCell(): Cell;
    address(): string;
  }

  interface Column {
    width(width?: number): Column;
    hidden(): boolean;
    hidden(hidden: boolean): Column;
  }

  interface Row {
    style(name: StyleNames): Record<string, unknown>;
    style(name: StyleName, value?: unknown): Row;
    style(styles: Record<string, unknown>): Row;
    height(height?: number): Row;
  }

  interface Sheet {
    cell(address: string): Cell;
    cell(rowNumber: number, columnNameOrNumber: string | number): Cell;
    range(address: string): Range;
    range(
      startRowNumber: number,
      startColumnNameOrNumber: string | number,
      endRowNumber: number,
      endColumnNameOrNumber: string | number,
    ): Range;
    column(nameOrIndex: string | number): Column;
    row(rowNumber: number): Row;
    freezePanes(xSplit: number, ySplit: number): Sheet;
    name(): string;
    name(name: string): Sheet;
    usedRange(): Range | undefined;
    delete(): void;
    active(active?: boolean): boolean | Sheet;
  }

  interface Workbook {
    sheet(nameOrIndex: string | number): Sheet;
    sheets(): Sheet[];
    addSheet(name: string, indexOrBeforeSheet?: number | string | Sheet): Sheet;
    activeSheet(): Sheet;
    activeSheet(sheet: Sheet | string | number): Workbook;
    cloneSheet(from: Sheet, name: string, indexOrBeforeSheet?: number | string | Sheet): Sheet;
    deleteSheet(sheet: Sheet | string | number): Workbook;
    toFileAsync(path: string): Promise<void>;
    outputAsync(): Promise<Buffer>;
  }

  const XlsxPopulate: {
    fromFileAsync(path: string): Promise<Workbook>;
    fromDataAsync(data: ArrayBuffer | Buffer | Uint8Array): Promise<Workbook>;
    fromBlankAsync(): Promise<Workbook>;
  };

  export default XlsxPopulate;
}
