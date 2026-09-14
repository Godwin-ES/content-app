// One-off generator for the binary supporting-material test fixtures
// (sample.docx, sample.pdf). Run with `node scripts/generate-material-fixtures.mjs`
// if the fixtures ever need regenerating; the checked-in output is what
// tests/unit/materials/extract.test.ts actually exercises.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "..", "tests", "fixtures", "materials");
const SAMPLE_TEXT = "Koya Content Studio supporting material sample text for extraction tests.";

async function generateDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  const word = zip.folder("word");
  word.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${SAMPLE_TEXT}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );
  word.folder("_rels").file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(path.join(FIXTURES_DIR, "sample.docx"), buffer);
}

async function generatePdf() {
  // Minimal hand-built single-page PDF containing SAMPLE_TEXT as a text object.
  const escaped = SAMPLE_TEXT.replace(/([()\\])/g, "\\$1");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 600 144] /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  const streamContent = `BT /F1 12 Tf 20 100 Td (${escaped}) Tj ET`;
  objects.push(`5 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  await writeFile(path.join(FIXTURES_DIR, "sample.pdf"), Buffer.from(pdf, "latin1"));
}

async function generatePlainFixtures() {
  await writeFile(path.join(FIXTURES_DIR, "sample.txt"), SAMPLE_TEXT + "\n");
  await writeFile(path.join(FIXTURES_DIR, "sample.md"), `# Sample\n\n${SAMPLE_TEXT}\n`);
}

await generatePlainFixtures();
await generateDocx();
await generatePdf();
console.log("Generated material fixtures in", FIXTURES_DIR);
