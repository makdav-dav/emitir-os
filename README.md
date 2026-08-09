# Emitir OS — SMMA Campo Largo

Aplicativo web para **emissão e gestão de Ordens de Serviço** do Departamento de
Produção Vegetal e Arborização da Secretaria de Meio Ambiente de Campo Largo/PR.

App estático (HTML/CSS/JS, sem build) sobre **Supabase** (Postgres + RLS + login
Google) e um **Web App do Apps Script** que geocodifica e gera o documento da OS
no Google Docs.

## Fluxo
Cadastrar solicitação (endereço com autocomplete + mapa + foto) → **Emitir OS**
(agrupa por proximidade, sequencia, gera o Google Doc) → **Baixa** (marca
executado com data/obs/foto). Mais **Painel** (dashboards) e envio de itens
isolados por **WhatsApp**.

## Publicação (GitHub Pages)
O site é servido da raiz do repositório. Em **Settings → Pages**, selecione a
branch `main` e a pasta `/ (root)`. A URL fica em
`https://<usuario>.github.io/<repo>/`.

> Importante: adicione essa URL nas **Redirect URLs** do Auth do Supabase para o
> login Google funcionar em produção.

## Configuração
1. **Banco:** rode os scripts `os_schema.sql` e depois os `os_fase*.sql` no SQL
   Editor do Supabase (na ordem).
2. **Web App:** publique `apps_script_webapp.gs` como App da Web (Executar como:
   Eu · Acesso: Qualquer pessoa). Defina a constante `TOKEN` com um segredo e
   coloque o mesmo valor em `os_config.OS_WEBAPP_TOKEN` (ver `os_config_webapp.sql`).
   Passo a passo em `DEPLOY_FASE3.md`.
3. **Acesso:** cadastre os e-mails autorizados em `usuarios_autorizados`
   (papéis: admin / editor / coletor / leitor).

## Segredos
- A **chave anon** do Supabase em `js/core.js` é pública por design (protegida por
  RLS) — pode ficar no repositório.
- O **TOKEN** do Web App **não** é versionado (fica só no seu deploy do Apps Script
  e em `os_config`). O `apps_script_webapp.gs` do repo traz um placeholder.
