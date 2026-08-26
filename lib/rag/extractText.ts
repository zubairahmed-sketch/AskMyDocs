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
  // Dynamic import: pdfjs-dist uses DOMMatrix which is not available
  // in Vercel's serverless Node.js runtime at module init time.
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

