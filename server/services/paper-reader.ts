import fs from "node:fs";
import path from "node:path";

/**
 * Supported paper file extensions and their extraction strategies.
 *
 * - .pdf  → pdf-parse
 * - .docx → mammoth (raw text extraction)
 * - .txt  → read as UTF-8
 */

export type SupportedExtension = ".pdf" | ".docx" | ".txt";

const SUPPORTED_EXTENSIONS = new Set<string>([".pdf", ".docx", ".txt"]);

/**
 * Check whether a file extension is supported.
 */
export function isSupportedPaperFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Extract plain text from a paper file.
 *
 * @param filePath Absolute or relative path to the file.
 * @returns Extracted plain text.
 * @throws If the file doesn't exist, has an unsupported extension, or
 *         extraction fails.
 */
export async function extractTextFromFile(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      return extractPdf(filePath);
    case ".docx":
      return extractDocx(filePath);
    case ".txt":
      return fs.readFileSync(filePath, "utf-8");
    default:
      throw new Error(
        `Unsupported file type: ${ext}. Supported: .pdf, .docx, .txt`,
      );
  }
}

/**
 * Extract text from a Buffer, given a known extension.
 * Useful when receiving file uploads on the server side.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  extension: string,
): Promise<string> {
  const ext = extension.toLowerCase().startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  switch (ext) {
    case ".pdf":
      return extractPdfBuffer(buffer);
    case ".docx":
      return extractDocxBuffer(buffer);
    case ".txt":
      return buffer.toString("utf-8");
    default:
      throw new Error(
        `Unsupported file type: ${ext}. Supported: .pdf, .docx, .txt`,
      );
  }
}

// ── PDF extraction ──────────────────────────────

async function extractPdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return extractPdfBuffer(buffer);
}

async function extractPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse is a CJS module — dynamic import for ESM compatibility
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const text = result.text?.trim();
    if (!text) {
      throw new Error("PDF contained no extractable text");
    }
    return text;
  } catch (err) {
    if ((err as Error).message?.includes("no extractable text")) throw err;
    throw new Error(`PDF extraction failed: ${(err as Error).message}`);
  }
}

// ── DOCX extraction ─────────────────────────────

async function extractDocx(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return extractDocxBuffer(buffer);
}

async function extractDocxBuffer(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim();
    if (!text) {
      throw new Error("DOCX contained no extractable text");
    }
    return text;
  } catch (err) {
    if ((err as Error).message?.includes("no extractable text")) throw err;
    throw new Error(`DOCX extraction failed: ${(err as Error).message}`);
  }
}

// Note: DOCX comment extraction requires direct XML parsing
// mammoth doesn't extract comments. Use extractDocxComments() for that.
// See the implementation in the Python scripts or add a Node XML parser.
