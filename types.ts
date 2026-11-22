export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  LIVE_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  SETUP_KEY: string;
}
export type Role = 'admin' | 'manager' | 'collaborator';
export interface User { id: string; name: string; email: string; role: Role; active: number }
