# ORBE PLANNER — primeira versão

Aplicativo web responsivo para planejamento editorial da ORBE, com autenticação por e-mail/senha, hierarquia de usuários, publicações, calendário, quadro de produção e sincronização em tempo real.

## Stack
- React + TypeScript + Vite
- Cloudflare Workers (API)
- Cloudflare D1 (dados relacionais)
- Cloudflare R2 (bucket de mídia provisionado; biblioteca visual será a próxima etapa)
- Durable Objects + WebSockets (eventos de sincronização)

## Requisitos
- Node.js 20.19+ ou 22.12+
- Conta Cloudflare
- npm

## 1. Instalar
```bash
npm install
```

## 2. Criar os recursos Cloudflare
Faça login:
```bash
npx wrangler login
```
Crie o banco:
```bash
npx wrangler d1 create orbe-planner-db
```
Copie o `database_id` retornado e substitua `REPLACE_WITH_D1_DATABASE_ID` em `wrangler.jsonc`.
Crie o bucket de arquivos:
```bash
npx wrangler r2 bucket create orbe-planner-media
```
Aplique a migration:
```bash
npm run db:remote
```

## 3. Definir a chave de configuração inicial
Defina um segredo forte para criar o primeiro administrador:
```bash
npx wrangler secret put SETUP_KEY
```
Use uma chave longa e aleatória. Ela será solicitada uma única vez na tela “Configurar primeiro administrador”. Após criar a primeira conta, remova a chave:
```bash
npx wrangler secret delete SETUP_KEY
```

## 4. Rodar localmente
Para desenvolvimento, configure `SETUP_KEY` em `.dev.vars` (não envie esse arquivo ao Git):
```env
SETUP_KEY="coloque-uma-chave-local-forte-aqui"
```
Depois:
```bash
npm run dev
```

## 5. Publicar
```bash
npm run deploy
```
O Wrangler publicará o Worker e os arquivos da aplicação. O endereço `*.workers.dev` será mostrado no terminal.

## Papéis
- **Administrador:** controle total, criação de integrantes e alteração de permissões.
- **Gerente:** acesso ao planejamento e à lista de equipe.
- **Colaborador:** cria e edita as próprias publicações.

## Notas importantes da primeira versão
- As contas de equipe são criadas pelo administrador dentro do sistema. O envio automático de convite por e-mail ainda não está implementado; compartilhe os dados iniciais por um canal seguro.
- A biblioteca visual de upload para R2, recuperação de senha por e-mail, notificações e auditoria detalhada ficam para a próxima etapa.
- A sessão usa cookie HttpOnly/Secure e senha derivada com PBKDF2. Use HTTPS no ambiente publicado.
- O WebSocket transmite eventos de alteração; os dados continuam persistidos no D1. Ao reconectar, o cliente carrega novamente as publicações do banco.

## Antes de usar com equipe real
Faça um teste com duas contas e dois dispositivos, revise os papéis e configure backups/exportações do banco. Não coloque chaves, senhas ou `.dev.vars` no repositório.
