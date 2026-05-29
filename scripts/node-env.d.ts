// Minimal Node.js ambient declarations for scripts that run under tsx.
// @types/node is not in devDependencies; this covers the subset used here.

declare module 'fs' {
  export function readFileSync(path: string, encoding: BufferEncoding): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readdirSync(path: string): string[];
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function dirname(p: string): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  exit(code?: number): never;
  argv: string[];
};
