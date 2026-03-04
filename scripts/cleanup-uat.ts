import { db } from '../src/lib/db/index';
import { profiles, users, facts, agentMemory, agentConfig, agentEvents, messages, connectors, authIdentities, sessions, page } from '../src/lib/db/schema';
import { like, inArray, sql } from 'drizzle-orm';

// Disable FK checks via raw pragma
(db as any).$client.pragma('foreign_keys = OFF');

const uatProfiles = db.select({ id: profiles.id, username: profiles.username })
  .from(profiles).where(like(profiles.username, 'uat-%')).all();
console.log('UAT profiles found:', uatProfiles.length);
if (uatProfiles.length === 0) { console.log('Nothing to clean'); process.exit(0); }

const profileIds = uatProfiles.map(p => p.id);
const usernames = uatProfiles.map(p => p.username).filter(Boolean) as string[];

const tryDelete = (label: string, fn: () => { changes: number }) => {
  try { const r = fn(); if (r.changes > 0) console.log(`  ${label}: ${r.changes}`); }
  catch (e: any) { console.log(`  ${label}: skipped (${e.message})`); }
};

tryDelete('agent_memory', () => db.delete(agentMemory).where(inArray(agentMemory.profileId, profileIds)).run());
tryDelete('agent_config', () => db.delete(agentConfig).where(inArray(agentConfig.profileId, profileIds)).run());
tryDelete('agent_events', () => db.delete(agentEvents).where(inArray(agentEvents.profileId, profileIds)).run());
tryDelete('messages', () => db.delete(messages).where(inArray(messages.profileId, profileIds)).run());
tryDelete('connectors', () => db.delete(connectors).where(inArray(connectors.profileId, profileIds)).run());
tryDelete('auth_identities', () => db.delete(authIdentities).where(inArray(authIdentities.profileId, profileIds)).run());
tryDelete('sessions', () => db.delete(sessions).where(inArray(sessions.profileId, profileIds)).run());
tryDelete('facts', () => db.delete(facts).where(inArray(facts.profileId, profileIds)).run());
if (usernames.length) tryDelete('page', () => db.delete(page).where(inArray(page.id, usernames)).run());
tryDelete('profiles', () => db.delete(profiles).where(inArray(profiles.id, profileIds)).run());
tryDelete('users', () => db.delete(users).where(like(users.email, '%@uat.openself.dev')).run());

(db as any).$client.pragma('foreign_keys = ON');
console.log('Done.');
