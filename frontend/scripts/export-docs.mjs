import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/lib/docs/content.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { docsSections } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const document = ["# WorldzPayments documentation", "", "Merchant guide and developer reference · API v1", "", "Code examples use testnet. Relative API paths refer to the frontend origin.", "", "## Contents", "", ...docsSections.map(section => `- [${section.title}](#${section.id})`), ""];
const escape = text => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const codeLanguage = language => ({ TypeScript: "ts", JSON: "json", JavaScript: "js", Shell: "sh", dotenv: "dotenv" })[language] ?? language.toLowerCase();
for (const section of docsSections) {
  document.push(`<a id="${section.id}"></a>`, "", `## ${section.title}`, "", section.description, "");
  for (const block of section.blocks) {
    if (block.type === "paragraph") document.push(block.text, "");
    if (block.type === "callout") document.push(`> **${block.title}**`, `> ${block.text}`, "");
    if (block.type === "list") document.push(...block.items.map(item => `- ${item}`), "");
    if (block.type === "steps") document.push(...block.items.map((step, i) => `${i + 1}. **${step.title}.** ${step.text}`), "");
    if (block.type === "code") document.push(`### ${block.title}`, "", `\`\`\`${codeLanguage(block.language)}`, block.code, "```", "");
    if (block.type === "table") document.push(`| ${block.headers.map(escape).join(" | ")} |`, `| ${block.headers.map(() => "---").join(" | ")} |`, ...block.rows.map(row => `| ${row.map(escape).join(" | ")} |`), "");
    if (block.type === "links") document.push(...block.items.map(link => `- [${link.label}](${link.href.startsWith("#") ? link.href : `https://YOUR_PLATFORM_ORIGIN${link.href}`})`), "");
  }
}
mkdirSync(resolve(root, "public/docs"), { recursive: true });
writeFileSync(resolve(root, "public/docs/worldzpayments-guide.md"), document.join("\n"));
console.log(`Exported ${docsSections.length} documentation topics to public/docs/worldzpayments-guide.md`);
