import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "src");
const serviceSource = readFileSync(join(root, "todo-service.ts"), "utf8");

if (!serviceSource.includes("removeTodo")) {
  console.error("FAIL: removeTodo not found");
  process.exit(1);
}

if (serviceSource.includes("index > todos.length")) {
  console.error("FAIL: off-by-one bug still present in removeTodo guard");
  process.exit(1);
}

console.log("PASS: todo-service checks ok");
