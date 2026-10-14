# Jarvis — Assistente de Voz

Arquivo único `jarvis.html` (HTML + CSS + JS puros, zero dependências).

## Uso
1. Abra `jarvis.html` no **Chrome ou Edge** (o reconhecimento de voz depende do motor do navegador).
   - Recomendado servir em `localhost` ou HTTPS para o navegador lembrar a permissão do microfone:
     `python -m http.server 8000` → `http://localhost:8000/jarvis.html`
2. Clique em **► ATIVAR SISTEMA** e permita o microfone.
3. Cole sua **Anthropic API key** em ⚙ (fica salva só no `localStorage` do navegador).
4. Diga **"Ei Jarvis"** + comando (ou só "Ei Jarvis" e fale o comando em até 8s). O campo de texto funciona sem wake word.

## Second Brain
- Notas iniciais embutidas em `NOTES`; alterações persistem em `localStorage["jarvis_notes"]`.
- O Jarvis salva informações novas sozinho via tag `[[SAVE:area|titulo|texto]]` (removida antes da fala).
- Clique em um nó do grafo para ver/apagar a nota. Exportar/resetar em ⚙.

## v6 · Agenda, E-mails, Notícias e Morning Digest

`server.js` (Node puro, sem `npm install`) é a "Antena": roda em `127.0.0.1:4242`, busca o iCal do Google
Agenda e o RSS do Google Notícias (allowlist) e lê o Gmail via IMAP **somente leitura** (`EXAMINE` + `BODY.PEEK`:
nada é marcado como lido).

1. **Node:** instale o Node.js LTS (nodejs.org).
2. **Abrir:** na pasta do projeto rode `node server.js` e deixe a janela aberta. Abra o `jarvis.html` (Edge/Chrome).
3. **Configurar (⚙ → Integrações):**
   - Link iCal: Google Agenda → Configurações → sua agenda → *Endereço secreto no formato iCal*.
   - Senha de app: ative a verificação em 2 etapas e gere em myaccount.google.com/apppasswords.
4. **Testar:** "Ei Jarvis, minha agenda" · "meus e-mails" · "notícias" · "bom dia" (ou ▶ GERAR na aba DIGEST).

Comandos locais não gastam tokens; só a triagem de e-mails novos (1 chamada por lote, com cache) e o
Morning Digest (1 chamada) usam a API.

## Fase 3 · Voz hiper-realista + Pesquisa web

- **ElevenLabs** (⚙ → Voz hiper-realista): cole a chave (elevenlabs.io → Profile → API Keys). Voz: escolhida automaticamente entre as vozes da sua conta (masculina, de preferência britânica), ou escolha em "Carregar minhas vozes".
  Sem chave, o Jarvis usa a voz do navegador. O microfone só reabre quando o áudio termina.
- **Tavily** (⚙ → Pesquisa web): cole a chave `tvly-...` (app.tavily.com). Exige `node server.js` rodando (rota `/search`).
  O Claude decide quando pesquisar (tool `web_search`), recebe o resultado e responde citando a fonte.
