/**
 * extractText.ts — Page-aware text extraction
 *
 * PDF: uses pdfjs-dist getPage(n).getTextContent() for true page-by-page extraction.
 * TXT/MD: whole-file read, page_number = null.
 *
 * Per SPEC Rule 7: pdfjs-dist, not pdf-parse — we need real page boundaries for citations.
 * Per SPEC Rule 3: every chunk must carry page_number from the moment it is created.
 *
 * NOTE: pdfjs-dist is dynamically imported inside extractFromPdf() to avoid loading
 * browser-only globals (DOMMatrix) at module init time on Vercel serverless.
 */

export interface ExtractedPage {
  pageNumber: number | null;
  text: string;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  pageCount: number;
}

/**
 * Extract text from a PDF buffer, page by page.
 * Each page's text is returned separately with its page number.
 */
async function extractFromPdf(buffer: ArrayBuffer): Promise<ExtractionResult> {
  // Polyfill DOMMatrix for Vercel's serverless Node.js runtime.
  // pdfjs-dist uses DOMMatrix internally for coordinate transforms during
  // text extraction. In Node.js this global doesn't exist. A minimal
  // identity-matrix stub is enough since we only read text, not render.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // @ts-expect-error — minimal polyfill, not a full spec implementation
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true; isIdentity = true;
      constructor(init?: string | number[]) {
        if (Array.isArray(init) && init.length === 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          this.m11 = this.a; this.m12 = this.b;
          this.m21 = this.c; this.m22 = this.d;
          this.m41 = this.e; this.m42 = this.f;
          this.isIdentity = false;
        }
      }
      inverse() { return new DOMMatrix(); }
      multiply() { return new DOMMatrix(); }
      scale() { return new DOMMatrix(); }
      translate() { return new DOMMatrix(); }
      transformPoint(p: Record<string, number> = {}) { return { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0, w: p.w ?? 1 }; }
      toFloat64Array() { return new Float64Array(16); }
      toString() { return 'matrix(1, 0, 0, 1, 0, 0)'; }
    };
  }

  // Dynamic import: only load pdfjs-dist when actually processing a PDF.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = doc.numPages;
  const pages: ExtractedPage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();

    // Reconstruct text from the text items, preserving line breaks
    const text = textContent.items
      .filter((item: Record<string, unknown>) => 'str' in item)
      .map((item: Record<string, unknown>) =>
        (item.hasEOL ? (item.str as string) + '\n' : (item.str as string))
      )
      .join('');

    if (text.trim().length > 0) {
      pages.push({ pageNumber: i, text: text.trim() });
    }
  }

  return { pages, pageCount };
}


/**
 * Extract text from a plain text or markdown file.
 * Returns the entire content as a single "page" with pageNumber = null.
 */
function extractFromText(buffer: ArrayBuffer): ExtractionResult {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(buffer);

  return {
    pages: text.trim().length > 0 ? [{ pageNumber: null, text: text.trim() }] : [],
    pageCount: 0,
  };
}

/**
 * Extract text from a file buffer based on its type.
 *
 * @param buffer - The file content as an ArrayBuffer
 * @param fileType - The file type: 'pdf', 'txt', or 'md'
 * @returns ExtractionResult with pages and page count
 */
export async function extractText(
  buffer: ArrayBuffer,
  fileType: string
): Promise<ExtractionResult> {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return extractFromPdf(buffer);
    case 'txt':
    case 'md':
      return extractFromText(buffer);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

