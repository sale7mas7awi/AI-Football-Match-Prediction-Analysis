import sqlite3, secrets
from pathlib import Path
import bcrypt

DB_PATH = Path(__file__).parent / 'world_cup.db'

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT UNIQUE NOT NULL,
                password   TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS user_predictions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER,
                team1      TEXT NOT NULL,
                team2      TEXT NOT NULL,
                user_pick  TEXT NOT NULL,
                ai_winner  TEXT,
                is_correct INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, team1, team2)
            );
            CREATE TABLE IF NOT EXISTS user_last_match (
                user_id    INTEGER PRIMARY KEY,
                match_id   TEXT,
                standings  TEXT,
                processed  TEXT,
                predictions TEXT,
                saved_at   TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        """)

def _migrate():
    migrations = [
        "ALTER TABLE user_predictions ADD COLUMN user_pick TEXT",
        "ALTER TABLE user_predictions ADD COLUMN ai_winner TEXT",
        "ALTER TABLE user_predictions ADD COLUMN is_correct INTEGER DEFAULT 0",
        "ALTER TABLE user_last_match ADD COLUMN standings TEXT",
        "ALTER TABLE user_last_match ADD COLUMN processed TEXT",
        "ALTER TABLE user_last_match ADD COLUMN predictions TEXT",
    ]
    with get_conn() as conn:
        for sql in migrations:
            try:
                conn.execute(sql)
            except Exception:
                pass  # column already exists, skip

def register_user(username, password):
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    try:
        with get_conn() as conn:
            cur = conn.execute(
                'INSERT INTO users (username,password) VALUES (?,?)',
                (username, hashed))
            return cur.lastrowid
    except sqlite3.IntegrityError:
        raise ValueError('اسم المستخدم مستخدم مسبقاً')

def login_user(username, password):
    with get_conn() as conn:
        row = conn.execute(
            'SELECT * FROM users WHERE username=?', (username,)).fetchone()
    if not row:
        raise ValueError('اسم المستخدم أو كلمة السر غير صحيحة')
    if not bcrypt.checkpw(password.encode(), row['password'].encode()):
        raise ValueError('اسم المستخدم أو كلمة السر غير صحيحة')
    token = secrets.token_hex(32)
    with get_conn() as conn:
        conn.execute('INSERT INTO sessions (token,user_id) VALUES (?,?)',
                     (token, row['id']))
    return token

def get_user_from_token(token):
    if not token: return None
    with get_conn() as conn:
        row = conn.execute("""
            SELECT u.id, u.username, u.created_at
            FROM sessions s JOIN users u ON s.user_id=u.id
            WHERE s.token=?""", (token,)).fetchone()
    return dict(row) if row else None

def logout_user(token):
    with get_conn() as conn:
        conn.execute('DELETE FROM sessions WHERE token=?', (token,))

def save_prediction(user_id, team1, team2, user_pick, ai_winner):
    is_correct = 1 if user_pick == ai_winner else 0
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO user_predictions
            (user_id,team1,team2,user_pick,ai_winner,is_correct)
            VALUES (?,?,?,?,?,?)""",
            (user_id, team1, team2, user_pick, ai_winner, is_correct))

def get_prediction_stats(user_id):
    with get_conn() as conn:
        row = conn.execute("""
            SELECT
              SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) as correct,
              SUM(CASE WHEN is_correct=0 THEN 1 ELSE 0 END) as wrong
            FROM user_predictions WHERE user_id=?""",
            (user_id,)).fetchone()
    return {'correct': row['correct'] or 0, 'wrong': row['wrong'] or 0}

def save_last_match(user_id, match_id, standings=None, processed=None, predictions=None):
    import json
    with get_conn() as conn:
        if match_id is None:
            conn.execute('DELETE FROM user_last_match WHERE user_id=?', (user_id,))
            return
        conn.execute("""
            INSERT OR REPLACE INTO user_last_match
            (user_id, match_id, standings, processed, predictions)
            VALUES (?,?,?,?,?)""",
            (user_id, match_id,
             json.dumps(standings)   if standings   else None,
             json.dumps(processed)   if processed   else None,
             json.dumps(predictions) if predictions else None))

def get_last_match(user_id):
    import json
    with get_conn() as conn:
        row = conn.execute("""
            SELECT match_id, standings, processed, predictions
            FROM user_last_match WHERE user_id=?""",
            (user_id,)).fetchone()
    if not row: return None
    return {
        'match_id':    row['match_id'],
        'standings':   json.loads(row['standings'])   if row['standings']   else None,
        'processed':   json.loads(row['processed'])   if row['processed']   else None,
        'predictions': json.loads(row['predictions']) if row['predictions'] else None,
    }

def get_all_stats():
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT team1, team2, COUNT(*) as total
            FROM user_predictions
            GROUP BY team1, team2
            ORDER BY total DESC
            LIMIT 10
        """).fetchall()
    return [dict(r) for r in rows]

def get_user_predictions(user_id):
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT team1, team2, user_pick, ai_winner, is_correct, created_at
            FROM user_predictions WHERE user_id=?
            ORDER BY created_at DESC
        """, (user_id,)).fetchall()
    return [dict(r) for r in rows]

init_db()
_migrate()