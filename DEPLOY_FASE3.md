# Fase 3 — Publicar o Web App e ligar a geração do Doc

Objetivo: o app web chama o Apps Script, que copia o template do Google Docs, preenche a OS e devolve a URL. O app grava a OS no banco.

## 1. Publicar o Apps Script como Web App
1. Abra o projeto Apps Script (o mesmo da planilha, em **Extensões → Apps Script**, ou script.google.com).
2. Crie um arquivo novo e cole o conteúdo de [`apps_script_webapp.gs`](apps_script_webapp.gs).
3. No topo do arquivo, troque `var TOKEN = "TROQUE_ESTE_TOKEN_123";` por um segredo à sua escolha (qualquer texto aleatório). **Anote esse valor.**
4. **Implantar → Nova implantação**.
   - Engrenagem → tipo **App da Web**.
   - **Executar como:** Eu (seu usuário).
   - **Quem pode acessar:** Qualquer pessoa.
   - **Implantar** → autorize os acessos (Drive/Docs) quando pedir.
5. Copie a **URL do app da Web** (termina em `/exec`).

> Ao alterar o `.gs` depois, use **Implantar → Gerenciar implantações → editar (lápis) → Nova versão**, senão a URL serve o código antigo.

## 2. Preencher as chaves no Supabase
Rode [`os_config_webapp.sql`](os_config_webapp.sql) uma vez (cria as chaves). Depois, no app, aba **Config**, preencha:
- **OS_WEBAPP_URL** = a URL `/exec` copiada.
- **OS_WEBAPP_TOKEN** = o mesmo segredo que você pôs no `TOKEN` do `.gs`.

Confira também que **OS_TEMPLATE_ID** aponta para o seu Google Doc modelo e que o template está acessível pela sua conta.

## 3. Emitir
No app: **Emitir** → selecione → **Agrupar e sequenciar** → **Gerar documento da OS**.
- Abre o Google Doc gerado numa nova aba.
- A OS entra no histórico (aba **OS**), as solicitações viram “emitida”, e o número da próxima OS avança sozinho.

## Se der erro
- **"Falta configurar OS_WEBAPP_URL"** → preencha na aba Config.
- **"Token inválido"** → o valor em OS_WEBAPP_TOKEN ≠ TOKEN do `.gs`.
- **Erro de CORS / resposta estranha** → normalmente é implantação antiga; gere **Nova versão** da implantação. O app já manda como `text/plain` de propósito, para evitar o preflight que o Apps Script não responde.
- **Erro de permissão no Drive** → reautorize a implantação (Executar como: Eu).
