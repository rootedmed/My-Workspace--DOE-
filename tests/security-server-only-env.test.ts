import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const forbiddenEnv = "SUPABASE_SERVICE_ROLE_KEY";

function fileExists(filepath: string): boolean {
  return fs.existsSync(filepath) && fs.statSync(filepath).isFile();
}

function resolveImport(fromFile: string, specifier: string): string | null {
  const basedir = path.dirname(fromFile);
  const candidates: string[] = [];

  if (specifier.startsWith("@/")) {
    const target = path.join(repoRoot, specifier.slice(2));
    candidates.push(target, `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.mjs`);
    candidates.push(path.join(target, "index.ts"), path.join(target, "index.tsx"));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = path.resolve(basedir, specifier);
    candidates.push(target, `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.mjs`);
    candidates.push(path.join(target, "index.ts"), path.join(target, "index.tsx"));
  } else {
    return null;
  }

  return candidates.find(fileExists) ?? null;
}

function collectClientEntries(): string[] {
  const roots = ["app", "components"];
  const entries: string[] = [];

  for (const root of roots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absoluteRoot)) {
      continue;
    }

    const stack = [absoluteRoot];
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
      } else if (/\.(ts|tsx)$/.test(current)) {
        const source = fs.readFileSync(current, "utf8");
        if (source.includes('"use client"') || source.includes("'use client'")) {
          entries.push(current);
        }
      }
    }
  }

  return entries;
}

function collectReachableFilesFromClientEntries(entries: string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) {
      continue;
    }
    visited.add(file);

    const source = fs.readFileSync(file, "utf8");
    const importRegex = /from\s+["']([^"']+)["']/g;
    for (const match of source.matchAll(importRegex)) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }
      const resolved = resolveImport(file, specifier);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return visited;
}

describe("security static checks", () => {
  it("does not expose SUPABASE_SERVICE_ROLE_KEY to client-reachable modules", () => {
    const clientEntries = collectClientEntries();
    const reachable = collectReachableFilesFromClientEntries(clientEntries);

    const offenders = [...reachable].filter((file) =>
      fs.readFileSync(file, "utf8").includes(forbiddenEnv)
    );

    expect(offenders).toEqual([]);
  });
});
