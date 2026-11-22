import { LiveRoom } from './live-room';
import type { Env, User, Role } from './types';
export { LiveRoom };

const json = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const id = () => crypto.randomUUID();
const encoder = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const randomToken = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); };
async function digest(value: string) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function hashPassword(password: string, salt = randomToken()) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 210000, hash: 'SHA-256' }, key, 256);
  return `${salt}:${hex(bits)}`;
}
async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');
  const actual = await hashPassword(password, salt);
  return actual.split(':')[1] === expected;
}
function cookie(request: Request, name: string) {
  const raw = request.headers.get('Cookie') || '';
  const item = raw.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}
async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = cookie(request, 'orbe_session'); if (!token) return null;
  const tokenHash = await digest(token);
  return await env.DB.prepare(`SELECT users.id, users.name, users.email, users.role, users.active FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires_at>? AND users.active=1`).bind(tokenHash, Date.now()).first<User>();
}
function requireRole(user: User, roles: Role[]) { return roles.includes(user.role); }
async function notify(env: Env, event: unknown) {
  const stub = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName('orbe-global'));
  await stub.fetch('https://live.internal/broadcast', { method: 'POST', body: JSON.stringify(event), headers: { 'content-type': 'application/json' } });
}
const safeUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const path = url.pathname;
    try {
      if (path === '/api/health') return json({ ok: true, app: 'ORBE PLANNER' });
      if (path === '/api/setup/status' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{count:number}>();
        return json({ initialized: (row?.count || 0) > 0 });
      }
      if (path === '/api/setup' && request.method === 'POST') {
        if (!env.SETUP_KEY || request.headers.get('x-setup-key') !== env.SETUP_KEY) return json({ error: 'Chave de configuração inválida.' }, 403);
        const count = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{count:number}>();
        if ((count?.count || 0) > 0) return json({ error: 'O ambiente já foi configurado.' }, 409);
        const body = await request.json() as any;
        if (!body.name || !body.email || !body.password || String(body.password).length < 10) return json({ error: 'Informe nome, e-mail e senha com pelo menos 10 caracteres.' }, 400);
        const userId = id(); const passwordHash = await hashPassword(String(body.password));
        await env.DB.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)').bind(userId, String(body.name).trim(), String(body.email).trim().toLowerCase(), passwordHash, 'admin').run();
        return json({ ok: true, message: 'Administrador criado. Agora entre pela tela de login.' }, 201);
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json() as any;
        const user = await env.DB.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE AND active=1').bind(String(body.email || '').trim()).first<any>();
        if (!user || !(await verifyPassword(String(body.password || ''), user.password_hash))) return json({ error: 'E-mail ou senha incorretos.' }, 401);
        const token = randomToken(); const expires = Date.now() + 60 * 60 * 24 * 14 * 1000;
        await env.DB.prepare('INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)').bind(await digest(token), user.id, expires).run();
        return json({ user: safeUser(user) }, 200, { 'set-cookie': `orbe_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600` });
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const token = cookie(request, 'orbe_session'); if (token) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(await digest(token)).run();
        return json({ ok: true }, 200, { 'set-cookie': 'orbe_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
      }
      const user = await currentUser(request, env);
      if (path === '/api/auth/me' && request.method === 'GET') return user ? json({ user: safeUser(user) }) : json({ user: null }, 401);
      if (!user) return json({ error: 'Faça login para continuar.' }, 401);
      if (path === '/api/live' && request.headers.get('Upgrade') === 'websocket') {
        const stub = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName('orbe-global'));
        const headers = new Headers(request.headers); headers.set('x-orbe-user', user.id);
        return stub.fetch(new Request(request, { headers }));
      }
      if (path === '/api/posts' && request.method === 'GET') {
        const result = await env.DB.prepare(`SELECT p.*, u.name AS owner_name FROM posts p LEFT JOIN users u ON u.id=p.owner_id ORDER BY CASE WHEN p.scheduled_at IS NULL THEN 1 ELSE 0 END, p.scheduled_at ASC, p.updated_at DESC`).all();
        return json({ posts: result.results });
      }
      if (path === '/api/posts' && request.method === 'POST') {
        const b = await request.json() as any;
        if (!String(b.title || '').trim()) return json({ error: 'O título é obrigatório.' }, 400);
        const postId = id();
        await env.DB.prepare(`INSERT INTO posts (id,title,client,platform,format,scheduled_at,objective,caption,asset_url,owner_id,approver,status,notes,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(postId, String(b.title).trim(), b.client || 'ORBE', b.platform || 'Instagram', b.format || 'Feed', b.scheduled_at || null, b.objective || '', b.caption || '', b.asset_url || '', b.owner_id || user.id, b.approver || '', b.status || 'idea', b.notes || '', user.id, user.id).run();
        await notify(env, { type: 'posts.changed', action: 'created', id: postId, by: user.name });
        return json({ id: postId }, 201);
      }
      if (path.startsWith('/api/posts/') && request.method === 'PUT') {
        const postId = path.split('/').pop()!;
        const existing = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(postId).first<any>();
        if (!existing) return json({ error: 'Publicação não encontrada.' }, 404);
        if (user.role === 'collaborator' && existing.owner_id !== user.id && existing.created_by !== user.id) return json({ error: 'Você só pode editar suas próprias publicações.' }, 403);
        const b = await request.json() as any;
        await env.DB.prepare(`UPDATE posts SET title=?,client=?,platform=?,format=?,scheduled_at=?,objective=?,caption=?,asset_url=?,owner_id=?,approver=?,status=?,notes=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(String(b.title || '').trim(), b.client || 'ORBE', b.platform || 'Instagram', b.format || 'Feed', b.scheduled_at || null, b.objective || '', b.caption || '', b.asset_url || '', b.owner_id || existing.owner_id || user.id, b.approver || '', b.status || 'idea', b.notes || '', user.id, postId).run();
        await notify(env, { type: 'posts.changed', action: 'updated', id: postId, by: user.name });
        return json({ ok: true });
      }
      if (path.startsWith('/api/posts/') && request.method === 'DELETE') {
        const postId = path.split('/').pop()!;
        const existing = await env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(postId).first<any>();
        if (!existing) return json({ error: 'Publicação não encontrada.' }, 404);
        if (user.role === 'collaborator' && existing.created_by !== user.id) return json({ error: 'Você só pode excluir publicações criadas por você.' }, 403);
        await env.DB.prepare('DELETE FROM posts WHERE id=?').bind(postId).run();
        await notify(env, { type: 'posts.changed', action: 'deleted', id: postId, by: user.name });
        return json({ ok: true });
      }
      if (path === '/api/users' && request.method === 'GET') {
        if (!requireRole(user, ['admin','manager'])) return json({ error: 'Sem permissão.' }, 403);
        const result = await env.DB.prepare('SELECT id,name,email,role,active,created_at FROM users ORDER BY name').all();
        return json({ users: result.results });
      }
      if (path === '/api/users' && request.method === 'POST') {
        if (!requireRole(user, ['admin'])) return json({ error: 'Somente o administrador pode adicionar integrantes.' }, 403);
        const b = await request.json() as any;
        if (!b.name || !b.email || !b.password || String(b.password).length < 10) return json({ error: 'Preencha os campos. A senha precisa ter pelo menos 10 caracteres.' }, 400);
        const role: Role = ['manager','collaborator'].includes(b.role) ? b.role : 'collaborator';
        try {
          const userId = id();
          await env.DB.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)').bind(userId, String(b.name).trim(), String(b.email).trim().toLowerCase(), await hashPassword(String(b.password)), role).run();
          return json({ id: userId }, 201);
        } catch { return json({ error: 'Não foi possível criar. Verifique se o e-mail já está cadastrado.' }, 409); }
      }
      if (path.startsWith('/api/users/') && request.method === 'PATCH') {
        if (!requireRole(user, ['admin'])) return json({ error: 'Somente o administrador pode alterar integrantes.' }, 403);
        const targetId = path.split('/').pop()!; const b = await request.json() as any;
        if (targetId === user.id && b.active === false) return json({ error: 'Você não pode desativar sua própria conta.' }, 400);
        await env.DB.prepare('UPDATE users SET role=COALESCE(?,role), active=COALESCE(?,active) WHERE id=?').bind(b.role && ['admin','manager','collaborator'].includes(b.role) ? b.role : null, typeof b.active === 'boolean' ? (b.active ? 1 : 0) : null, targetId).run();
        return json({ ok: true });
      }
      return json({ error: 'Rota não encontrada.' }, 404);
    } catch (error) {
      console.error(error); return json({ error: 'Ocorreu um erro interno. Tente novamente.' }, 500);
    }
  }
};
