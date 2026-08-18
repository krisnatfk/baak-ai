/**
 * Deklarasi tipe minimal untuk `mammoth` (paket tidak menyertakan types
 * sendiri dan @types/mammoth tidak tersedia di registry). Hanya mencakup API
 * yang dipakai aplikasi ini (ekstraksi teks mentah dari DOCX).
 */
declare module "mammoth" {
  export interface InputOptions {
    path?: string;
    buffer?: Buffer | ArrayBuffer;
    arrayBuffer?: ArrayBuffer;
  }

  export interface RawResult {
    value: string;
    messages: unknown[];
  }

  export function extractRawText(input: InputOptions): Promise<RawResult>;
  export function convertToHtml(input: InputOptions): Promise<RawResult>;
  export function convertToMarkdown(input: InputOptions): Promise<RawResult>;
}
