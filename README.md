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
