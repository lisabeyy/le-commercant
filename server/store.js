// Persistence: SQLite file by default (light, zero-config, survives restarts),
// Postgres when DATABASE_URL is set for a managed deployment.
// Two things live here: wallet identities (so a player can own their name) and the score board.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const newToken = () => crypto.randomBytes(24).toString('hex');

function pgStore(url){
  const {Pool} = require('pg');
  const db = new Pool({connectionString:url, ssl: /railway\.internal|localhost/.test(url) ? false : {rejectUnauthorized:false}, max:5});
  const one = async (q, v) => (await db.query(q, v)).rows[0] || null;
  return {
    kind:'postgres',
    async init(){
      await db.query(`
        create table if not exists users(
          id serial primary key, token text unique not null, wallet text unique,
          name text, created_at timestamptz not null default now());
        create table if not exists scores(
          id serial primary key, name text not null, wallet text, score integer not null,
          kos integer not null default 0, secs double precision not null default 0,
          created_at timestamptz not null default now());
        create index if not exists scores_rank on scores(score desc, created_at asc);`);
    },
    byToken: t => one('select * from users where token=$1', [t]),
    async walletUser(wallet, name){
      return await one('select * from users where wallet=$1', [wallet])
        || await one('insert into users(token, wallet, name) values($1,$2,$3) on conflict(wallet) do update set name=excluded.name returning *', [newToken(), wallet, name||null]);
    },
    async setName(id, name){ await db.query('update users set name=$2 where id=$1', [id, name]); },
    async addScore(s){
      const row = await one('insert into scores(name, wallet, score, kos, secs) values($1,$2,$3,$4,$5) returning id', [s.name, s.wallet||null, s.score, s.kos, s.secs]);
      const r = await one('select count(*)::int as n from scores where score > $1', [s.score]);
      return {id:row.id, rank:r.n + 1};
    },
    leaderboard: async n => (await db.query('select name, score, kos, secs, wallet from scores order by score desc, created_at asc limit $1', [n])).rows,
    async clean(n){ await db.query('delete from scores where id not in (select id from scores order by score desc limit $1)', [n]); }
  };
}

function sqliteStore(file){
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    create table if not exists users(
      id integer primary key autoincrement, token text unique not null, wallet text unique,
      name text, created_at text not null default (datetime('now')));
    create table if not exists scores(
      id integer primary key autoincrement, name text not null, wallet text, score integer not null,
      kos integer not null default 0, secs real not null default 0,
      created_at text not null default (datetime('now')));
    create index if not exists scores_rank on scores(score desc, created_at asc);`);
  const q = {
    byToken: db.prepare('select * from users where token=?'),
    byWallet: db.prepare('select * from users where wallet=?'),
    byId: db.prepare('select * from users where id=?'),
    insUser: db.prepare('insert into users(token, wallet, name) values(?,?,?)'),
    setName: db.prepare('update users set name=? where id=?'),
    insScore: db.prepare('insert into scores(name, wallet, score, kos, secs) values(?,?,?,?,?)'),
    rank: db.prepare('select count(*) + 1 as n from scores where score > ?'),
    board: db.prepare('select name, score, kos, secs, wallet from scores order by score desc, created_at asc, id asc limit ?'),
    clean: db.prepare('delete from scores where id not in (select id from scores order by score desc, created_at asc limit ?)')
  };
  return {
    kind:'sqlite',
    async init(){},
    byToken: async t => q.byToken.get(t) || null,
    async walletUser(wallet, name){
      const row = q.byWallet.get(wallet);
      if(row){
        if(name && name !== row.name){ q.setName.run(name, row.id); row.name = name; }
        return row;
      }
      try{
        const id = q.insUser.run(newToken(), wallet, name||null).lastInsertRowid;
        return q.byId.get(id);
      }catch(e){
        const again = q.byWallet.get(wallet);
        if(again) return again;
        throw e;
      }
    },
    async setName(id, name){ q.setName.run(name, id); },
    async addScore(s){
      const id = q.insScore.run(s.name, s.wallet||null, s.score, s.kos, s.secs).lastInsertRowid;
      return {id, rank: q.rank.get(s.score).n};
    },
    leaderboard: async n => q.board.all(n),
    async clean(n){ q.clean.run(n); }
  };
}

function memStore(){
  const byTok = new Map(), byWallet = new Map(), scores = [];
  let uid = 0;
  const mk = (wallet, name) => { const u = {id:++uid, token:newToken(), wallet, name:name||null}; byTok.set(u.token,u); if(wallet) byWallet.set(wallet,u); return u; };
  return {
    kind:'memory',
    async init(){},
    byToken: async t => byTok.get(t) || null,
    walletUser: async (w, name) => { const u = byWallet.get(w); if(u){ if(name) u.name = name; return u; } return mk(w, name); },
    setName: async (id, name) => { for(const u of byTok.values()) if(u.id===id) u.name = name; },
    async addScore(s){
      const rec = {name:s.name, wallet:s.wallet||null, score:s.score, kos:s.kos, secs:s.secs};
      scores.push(rec);
      scores.sort((a,b)=> b.score - a.score);
      if(scores.length > 500) scores.length = 500;
      return {id:rec, rank: scores.findIndex(x=>x===rec) + 1};
    },
    leaderboard: async n => scores.slice(0, n),
    async clean(){}
  };
}

function pick(){
  if(process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'le-commercant.db');
  if(file === ':memory:') return memStore();
  try{ return sqliteStore(file); }
  catch(e){
    console.warn('sqlite unavailable, falling back to memory:', e.message);
    return memStore();
  }
}

module.exports = pick();
