/*
  Handing a file to the user.

  Deliberately the only DOM-touching file in `export/`, and deliberately trivial: an
  anchor with an object URL is the boring approach that works on a locked-down work
  machine with no permissions and no File System Access API. The fancier
  `showSaveFilePicker` route is not available in every browser this has to run in.
*/

/** The version this build was compiled from. Injected by vite.config.ts. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

export function downloadBytes(bytes: Uint8Array, filename: string, type = 'application/zip'): void {
  // Copied into a fresh buffer: a Uint8Array from fflate may be a view onto a larger
  // pooled buffer, and Blob would otherwise take the whole thing.
  const blob = new Blob([bytes.slice()], { type });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoked on the next tick rather than immediately: some browsers have not finished
  // reading the blob when click() returns, and revoking early gives a silent 0-byte
  // download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reads a picked file into the bytes `readBundle` expects. */
export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
