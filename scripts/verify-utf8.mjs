import { readFile } from "node:fs/promises";

const MANIFEST_PATH = "RELEASE_MANIFEST.json";
const TEXT_ASSET_PATTERN = /\.(?:html|js|css|json|webmanifest)$/i;

function inspectText(text) {
  const problems = [];
  if (text.includes("\uFFFD")) problems.push("replacement character");
  if (/เธ|เน€/.test(text)) problems.push("Thai mojibake marker");
  if (/[\u0080-\u009F]/u.test(text)) problems.push("C1 control character");
  return problems;
}

const manifestText = await readFile(new URL(`../${MANIFEST_PATH}`, import.meta.url), "utf8");
const manifestProblems = inspectText(manifestText);
if (manifestProblems.length) {
  console.error(`${MANIFEST_PATH}: ${manifestProblems.join(", ")}`);
  process.exit(1);
}

const manifest = JSON.parse(manifestText);
if (!Array.isArray(manifest.productionFiles) || !manifest.productionFiles.length) {
  throw new Error("RELEASE_MANIFEST.json ไม่มี productionFiles สำหรับ UTF-8 gate");
}

const productionFiles = [...new Set(
  manifest.productionFiles
    .map(item => item?.path)
    .filter(path => typeof path === "string" && TEXT_ASSET_PATTERN.test(path))
)];

if (!productionFiles.length) throw new Error("ไม่พบ text production assets สำหรับ UTF-8 gate");

const failures = [];
for (const file of productionFiles) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const problems = inspectText(text);
  if (problems.length) failures.push(`${file}: ${problems.join(", ")}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`UTF-8 verified: ${productionFiles.length} production text assets + ${MANIFEST_PATH}`);
}
