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

  const db = process.env.DB_NAME ?? "akademiya";

  // DB가 없으면 생성
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${db}\``);

  // 마이그레이션 추적 테이블 생성
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 이미 적용된 마이그레이션 목록 조회
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT filename FROM schema_migrations"
  );
  const applied = new Set((rows as mysql.RowDataPacket[]).map((r) => r.filename));

  // 부트스트랩: schema_migrations가 비어 있고 users 테이블이 이미 존재하면
  // 현재 서버에 스키마가 이미 적용된 것이므로 000_full_schema.sql을 실행 없이 등록
  if (applied.size === 0) {
    const [tableCheck] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
      [db]
    );
    if ((tableCheck[0] as any).cnt > 0) {
      await conn.query(
        "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
        ["000_full_schema.sql"]
      );
      applied.add("000_full_schema.sql");
      console.log("Bootstrap: 기존 DB 감지 — 000_full_schema.sql 실행 없이 적용됨으로 등록.");
    }
  }

  const dir = path.join(import.meta.dirname, "migrations");
  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`– ${file} (이미 적용됨, 건너뜀)`);
      continue;
    }

    const sql = await fs.readFile(path.join(dir, file), "utf-8");
    if (!sql.trim()) {
      console.log(`– ${file} (빈 파일, 건너뜀)`);
      await conn.query(
        "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
        [file]
      );
      continue;
    }

    await conn.query(sql);
    await conn.query(
      "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
      [file]
    );
    console.log(`✓ ${file}`);
  }

  await conn.end();
  console.log("Migration complete.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
