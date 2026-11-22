import { DurableObject } from 'cloudflare:workers';
export class LiveRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message = await request.text();
      for (const socket of this.ctx.getWebSockets()) { try { socket.send(message); } catch { /* client reconnects */ } }
      return new Response('ok');
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ userId: request.headers.get('x-orbe-user') || '' });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(_socket: WebSocket, _message: string | ArrayBuffer) {}
  webSocketClose(socket: WebSocket) { try { socket.close(); } catch {} }
}
