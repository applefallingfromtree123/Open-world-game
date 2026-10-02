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
      const { default: pg } = await import('pg');
      // Neon 등 무료 DB는 잠들어 있다가 첫 연결이 느릴 수 있으므로 여러 번 재시도
      for (let attempt = 1; attempt <= 6; attempt++) {
        try {
          this.pg = new pg.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
            max: 3,
            connectionTimeoutMillis: 15000,
          });
          await this.pg.query('CREATE TABLE IF NOT EXISTS neon_void_state (k TEXT PRIMARY KEY, v JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())');
          console.log('[db] PostgreSQL 저장소 사용 — 계정이 영구 보존됩니다.');
          return;
        } catch (e) {
          console.error(`[db] PostgreSQL 연결 실패 (${attempt}/6):`, e.message);
          try { await this.pg?.end(); } catch {}
          this.pg = null;
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
      console.error('[db] ⚠ PostgreSQL에 연결하지 못해 임시 파일 저장소를 사용합니다. DATABASE_URL을 확인하세요.');
    } else {
      console.warn('[db] ⚠ DATABASE_URL이 없어 파일에 저장합니다. Render 무료 서버에서는 재시작 시 초기화됩니다 (브라우저 백업으로 계정은 복구됨).');
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('[db] 파일 저장소 사용:', FILE);
  }

  // 데이터가 없으면 null, 읽기 자체가 실패하면 예외 — 실패를 '빈 세계'로 착각해 기존 저장을 덮어쓰지 않도록
  async load() {
    if (this.pg) {
      for (let attempt = 1; ; attempt++) {
        try {
          const r = await this.pg.query("SELECT v FROM neon_void_state WHERE k = 'state'");
          return r.rows[0] ? r.rows[0].v : null;
        } catch (e) {
          console.error(`[db] 불러오기 실패 (${attempt}/5):`, e.message);
          if (attempt >= 5) throw e;
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
    }
    if (!fs.existsSync(FILE)) return null;
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
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
