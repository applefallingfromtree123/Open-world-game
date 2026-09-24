// 저장소: DATABASE_URL(PostgreSQL)이 있으면 DB에, 없으면 JSON 파일에 저장
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'save.json');

export class Store {
  constructor() {
    this.pg = null;
  }

  async init() {
    if (process.env.DATABASE_URL) {
      try {
        const { default: pg } = await import('pg');
        this.pg = new pg.Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
          max: 3,
        });
        await this.pg.query('CREATE TABLE IF NOT EXISTS neon_void_state (k TEXT PRIMARY KEY, v JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())');
        console.log('[db] PostgreSQL 저장소 사용');
        return;
      } catch (e) {
        console.error('[db] PostgreSQL 연결 실패, 파일 저장소로 대체:', e.message);
        this.pg = null;
      }
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('[db] 파일 저장소 사용:', FILE);
  }

  async load() {
    try {
      if (this.pg) {
        const r = await this.pg.query("SELECT v FROM neon_void_state WHERE k = 'state'");
        return r.rows[0] ? r.rows[0].v : null;
      }
      if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      console.error('[db] 불러오기 실패:', e.message);
    }
    return null;
  }

  async save(state) {
    const json = JSON.stringify(state);
    try {
      if (this.pg) {
        await this.pg.query(
          "INSERT INTO neon_void_state (k, v, updated) VALUES ('state', $1, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated = now()",
          [json],
        );
        return;
      }
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('[db] 저장 실패:', e.message);
    }
  }
}
