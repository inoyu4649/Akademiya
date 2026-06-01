import mysql from "mysql2/promise";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    multipleStatements: true,
  });

  const dir = path.join(import.meta.dirname, "migrations");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(dir, file), "utf-8");
    if (!sql.trim()) { console.log(`– ${file} (skipped: empty)`); continue; }
    await conn.query(sql);
    console.log(`✓ ${file}`);
  }

  await conn.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
