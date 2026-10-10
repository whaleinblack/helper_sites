// Disposable, local-only account UI fixture; never opens an operational database.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentityStore,passwordHash } from '../server/store.mjs';
import { createIdentityServer } from '../server/server.mjs';
const path=join(mkdtempSync(join(tmpdir(),'identity-ui-fixture-')),'identity.sqlite');
const db=new DatabaseSync(path);
db.exec(`CREATE TABLE identity_meta(id INTEGER PRIMARY KEY,version INTEGER,revision INTEGER);INSERT INTO identity_meta VALUES(1,1,0);
CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,email TEXT,role TEXT,status TEXT,password_hash TEXT,password_change_required INTEGER,last_login_at TEXT,updated_at TEXT);
CREATE TABLE identity_grants(user_id TEXT,service TEXT,PRIMARY KEY(user_id,service));
CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT,session_token_hash TEXT,created_at TEXT,expires_at TEXT,last_seen_at TEXT,ip TEXT,user_agent TEXT,meta_json TEXT);
CREATE TABLE user_admin_audit_events(id TEXT,actor_user_id TEXT,target_user_id TEXT,action TEXT,details_json TEXT,created_at TEXT);`);
db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,0,NULL,NULL)').run('fixture-preview','preview','fixture@example.invalid','admin','active',await passwordHash('Local-Preview-123'));
for(const scope of ['production','development','drive','status','photo-admin','live-admin'])db.prepare('INSERT INTO identity_grants VALUES (?,?)').run('fixture-preview',scope);
db.close();
const store=new IdentityStore(path);
createIdentityServer({store,clients:[],origin:'http://localhost:44393'}).listen(44393,'127.0.0.1',()=>console.log('Local account fixture: http://localhost:44393/account/'));
