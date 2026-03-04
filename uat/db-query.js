#!/usr/bin/env node
// UAT DB query helper — supports both session_id and profile_id lookups
const Database = require('better-sqlite3');
const db = new Database('db/openself.db', { readonly: true });

const cmd = process.argv[2];
const sessionId = process.argv[3] || db.prepare('SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1').get()?.id;

// Resolve profile_id from session
const profileId = db.prepare('SELECT profile_id FROM sessions WHERE id=?').get(sessionId)?.profile_id;

// Use profile_id if available, else fall back to session_id
const factsWhere = profileId
  ? { clause: 'profile_id=?', param: profileId }
  : { clause: 'session_id=?', param: sessionId };

const pageWhere = profileId
  ? { clause: 'profile_id=?', param: profileId }
  : { clause: 'session_id=?', param: sessionId };

switch (cmd) {
  case 'session':
    console.log(JSON.stringify(db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1').get(), null, 2));
    break;
  case 'facts': {
    const cat = process.argv[4];
    const q = cat
      ? db.prepare(`SELECT category, key, substr(value,1,80) as value, visibility FROM facts WHERE ${factsWhere.clause} AND category=? AND archived_at IS NULL ORDER BY category, key`)
      : db.prepare(`SELECT category, key, substr(value,1,80) as value, visibility FROM facts WHERE ${factsWhere.clause} AND archived_at IS NULL ORDER BY category, key`);
    const rows = cat ? q.all(factsWhere.param, cat) : q.all(factsWhere.param);
    console.table(rows);
    break;
  }
  case 'facts-full': {
    const cat2 = process.argv[4];
    const q2 = cat2
      ? db.prepare(`SELECT category, key, value, visibility FROM facts WHERE ${factsWhere.clause} AND category=? AND archived_at IS NULL ORDER BY category, key`)
      : db.prepare(`SELECT category, key, value, visibility FROM facts WHERE ${factsWhere.clause} AND archived_at IS NULL ORDER BY category, key`);
    const rows2 = cat2 ? q2.all(factsWhere.param, cat2) : q2.all(factsWhere.param);
    console.table(rows2);
    break;
  }
  case 'facts-count':
    console.table(db.prepare(`SELECT category, count(*) as cnt FROM facts WHERE ${factsWhere.clause} AND archived_at IS NULL GROUP BY category ORDER BY category`).all(factsWhere.param));
    break;
  case 'draft': {
    const draft = db.prepare(`SELECT id, status, config_hash, substr(config,1,300) as config_preview FROM page WHERE id='draft' AND ${pageWhere.clause}`).get(pageWhere.param);
    console.log(JSON.stringify(draft, null, 2));
    break;
  }
  case 'draft-config': {
    const dc = db.prepare(`SELECT config FROM page WHERE id='draft' AND ${pageWhere.clause}`).get(pageWhere.param);
    if (dc) {
      const cfg = JSON.parse(dc.config);
      console.log('layout:', cfg.layoutTemplate || '(none)');
      console.log('theme:', cfg.style?.theme || '(none)');
      console.log('sections:', cfg.sections?.map(s => s.type).join(', '));
    } else {
      console.log('No draft found');
    }
    break;
  }
  case 'published': {
    const pub = db.prepare(`SELECT id, status, username FROM page WHERE status='published' AND ${pageWhere.clause}`).get(pageWhere.param);
    console.log(JSON.stringify(pub, null, 2));
    break;
  }
  case 'pages':
    console.table(db.prepare('SELECT id, status, username, session_id, profile_id FROM page ORDER BY updated_at DESC').all());
    break;
  case 'profiles':
    console.table(db.prepare('SELECT * FROM profiles ORDER BY created_at DESC LIMIT 5').all());
    break;
  case 'orphans': {
    const orphans = db.prepare('SELECT count(*) as cnt FROM facts WHERE session_id NOT IN (SELECT DISTINCT id FROM sessions)').get();
    console.log('Orphaned facts:', orphans.cnt);
    break;
  }
  case 'info':
    console.log('Session ID:', sessionId);
    console.log('Profile ID:', profileId || '(none)');
    console.log('Facts where:', factsWhere.clause, '=', factsWhere.param);
    break;
  default:
    console.log('Usage: node uat/db-query.js <session|facts|facts-full|facts-count|draft|draft-config|published|pages|profiles|orphans|info> [sessionId] [category]');
}
db.close();
