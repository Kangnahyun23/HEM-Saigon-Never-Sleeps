/** Kiểu cho scripts/zip.mjs (để unit test TypeScript import được). */
export declare const ITCH_LIMITS: { maxFiles: number; maxFileBytes: number; maxTotalBytes: number };
export declare function checkBundle(files: { path: string; size: number }[], indexHtml: string): string[];
export declare function createZip(entries: { path: string; data: Uint8Array }[]): Buffer;
