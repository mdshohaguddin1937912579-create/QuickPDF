import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LoadedPdfJsHandle {
  doc: pdfjsLib.PDFDocumentProxy;
  close: () => Promise<void>;
}

export async function openPdfJsDocument(arrayBuffer: ArrayBuffer): Promise<LoadedPdfJsHandle> {
  // Pass a fresh Uint8Array copy so pdf.js worker transfer doesn't detach caller's ArrayBuffer
  const dataCopy = new Uint8Array(arrayBuffer.slice(0));
  const loadingTask = pdfjsLib.getDocument({
    data: dataCopy,
    useSystemFonts: true,
  });

  try {
    const doc = await loadingTask.promise;
    return {
      doc,
      close: async () => {
        try {
          await loadingTask.destroy();
        } catch {
          // Ignore teardown errors
        }
      },
    };
  } catch (err: unknown) {
    try {
      await loadingTask.destroy();
    } catch {
      // Ignore teardown errors
    }
    if (err && typeof err === 'object' && 'name' in err) {
      const errName = String((err as { name?: string }).name);
      if (errName === 'PasswordException') {
        throw new Error(
          'This PDF is password-protected. Please unlock the PDF before processing it locally.'
        );
      }
      if (errName === 'InvalidPDFException') {
        throw new Error(
          'The selected file is corrupted or is not a valid PDF document.'
        );
      }
    }
    const message = err instanceof Error ? err.message : 'Unable to read PDF file.';
    throw new Error(`Could not read PDF: ${message}`);
  }
}

export async function inspectPdfPageCount(file: File): Promise<number | undefined> {
  try {
    const buffer = await file.arrayBuffer();
    const handle = await openPdfJsDocument(buffer);
    const numPages = handle.doc.numPages;
    await handle.close();
    return numPages;
  } catch {
    return undefined;
  }
}
