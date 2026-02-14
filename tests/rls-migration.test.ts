import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase/migrations");

describe("RLS migration", () => {
  it("enables RLS and uses explicit per-operation policies", () => {
    const sql = fs.readFileSync(path.join(migrationsDir, "002_rls.sql"), "utf8");

    expect(sql).toContain("enable row level security");
    expect(sql).toContain("for select");
    expect(sql).toContain("for insert");
    expect(sql).toContain("for update");
    expect(sql).toContain("for delete");
    expect(sql).not.toContain("for all");
    expect(sql).toContain("with check");
    expect(sql).toContain("using");
  });

  it("does not use unsupported 'create policy if not exists' and avoids FOR ALL policies", () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.join(migrationsDir, name));

    const offendersIfNotExists: string[] = [];
    const offendersForAll: string[] = [];

    for (const file of files) {
      const sql = fs.readFileSync(file, "utf8").toLowerCase();
      if (sql.includes("create policy if not exists")) {
        offendersIfNotExists.push(path.basename(file));
      }
      if (sql.includes(" for all ")) {
        offendersForAll.push(path.basename(file));
      }
    }

    expect(offendersIfNotExists).toEqual([]);
    expect(offendersForAll).toEqual([]);
  });
});
