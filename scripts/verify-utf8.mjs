import { readFile } from "node:fs/promises";

const productionFiles = [
  "index.html",
  "app.js",
  "styles.css",
  "flow-era.css",
  "flow-era.js",
  "highway-gate.js",
  "flow-era-3.5.css",
  "flow-era-3.5.js",
  "metropolis-v4.css",
  "metropolis-v4.js",
  "metropolis-r5.css",
  "metropolis-r5.js",
  "sw-bootstrap.js",
  "sw.js",
  "manifest.webmanifest"
];

const failures = [];
for (const file of productionFiles) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const problems = [];
  if (text.includes("\uFFFD")) problems.push("replacement character");
  if (/เธ|เน€/.test(text)) problems.push("Thai mojibake marker");
  if(/[\u0080-\u009F]/u.test(text)) problems.push("C1 control character");
  if (problems.length) failures.push(`${file}: ${problems.join(", ")}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`UTF-8 verified: ${productionFiles.length} production files`);
}
