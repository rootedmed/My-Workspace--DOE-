import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const forbidden = "SUPABASE_SERVICE_ROLE_KEY";

function collectFiles(root: string): string[] {
  const output: string[] = [];
  const absolute = path.join(repoRoot, root);
  if (!fs.existsSync(absolute)) {
    return output;
  }

  const stack = [absolute];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
    } else if (!current.endsWith(".test.ts") && !current.endsWith(".test.tsx")) {
      output.push(current);
    }
  }

  return output;
}

describe("runtime service-role guard", () => {
  it("does not reference SUPABASE_SERVICE_ROLE_KEY in app/lib runtime code", () => {
    const files = [...collectFiles("app"), ...collectFiles("lib"), path.join(repoRoot, "middleware.ts")];
    const offenders = files.filter((file) => fs.readFileSync(file, "utf8").includes(forbidden));
    expect(offenders).toEqual([]);
  });
});
