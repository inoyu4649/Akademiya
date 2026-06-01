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

  // 부트스트랩: 추적 테이블이 새로 만들어졌지만 DB에 이미 스키마가 있는 경우
  // (추적 시스템 도입 이전에 수동 또는 이전 방식으로 실행된 마이그레이션 자동 등록)
  if (applied.size === 0) {
    const [colCheck] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_banned'`,
      [db]
    );
    if ((colCheck[0] as any).cnt > 0) {
      // is_banned 컬럼이 있으면 001~004가 이미 적용된 것
      const toSeed = [
        "001_init.sql",
        "002_oauth_nullable.sql",
        "003_user_reports.sql",
        "004_code_resize.sql",
      ];
      for (const f of toSeed) {
        await conn.query(
          "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
          [f]
        );
        applied.add(f);
      }
      console.log("Bootstrap: 001~004 이미 적용됨으로 등록.");
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
