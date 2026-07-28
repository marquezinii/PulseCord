# Estado do Projeto — PulseCord

_Atualizado em 28/07/2026._

## Objetivo

PulseCord é um shell desktop independente, público e open source para usar o
Discord oficial em uma aplicação Electron segura. O produto está na fase de
fundação: disponibiliza personalização própria, temas locais, atalhos globais e
uma base de plugins first-party, sem instalador ou carregamento de plugins de
terceiros.

O checkout canônico é `C:\Projetos\PulseCord`. O repositório remoto é
`marquezinii/PulseCord` e a branch de desenvolvimento ativa é
`dev/proxima-versao`.

## Arquitetura e tecnologias

- Electron 41, Node.js 24+, npm 11+, TypeScript 6 e esbuild;
- processos separados: `src/main`, `src/preload`, `src/renderer` e `src/shared`;
- janela isolada e sandboxed que carrega somente `https://discord.com/app`;
- IPC versionado, estreito e validado no processo principal;
- `PulseCore` para ciclo de vida de plugins first-party com capacidades
  limitadas e limpeza reversível;
- `PulsePanel` em Shadow DOM fechado e integração de configurações sem importar
  módulos privados do Discord;
- persistência local atômica, schema versionado, recuperação por safe mode e
  atalhos globais registrados explicitamente pelo usuário.

A descrição arquitetural detalhada está em `docs/ARCHITECTURE.md`. Segurança,
API de plugins, roadmap e política clean-room estão em `docs/`.

## Estrutura relevante

- `src/main`: janela, segurança, IPC, persistência, atalhos e recuperação;
- `src/preload`: ponte restrita entre a página e o processo principal;
- `src/renderer`: PulsePanel, branding, configurações, temas e PulseCore;
- `src/shared`: contratos versionados compartilhados;
- `assets` e `build`: identidade visual e ícones do produto;
- `scripts`: build, verificação clean-room e launcher de desenvolvimento;
- `docs`: decisões e políticas técnicas;
- `outputs`: pacotes locais gerados, sem publicação automática.

## Funcionalidades concluídas

- Shell Electron com login no domínio oficial, sem coleta de senha do Discord;
- identidade desktop do PulseCord, sem ponte privada de outro cliente;
- categoria PulseCord nas configurações: Plugins, Themes e PulseCord Shortcuts;
- editor de CSS local com preview, persistência explícita, safe mode e bloqueio
  de imports/recursos remotos;
- atalhos globais próprios, com criação, edição, remoção e detecção de conflito;
- lista padrão de atalhos do Discord preservada quando disponível, sem copiar
  implementação privada;
- PulsePanel com arte exclusiva roxo-azul, acentos roxos e opção para acompanhar
  o ícone Home do Discord;
- persistência atômica, recuperação de falha do renderer e tela offline;
- atalho `PulseCord.lnk` que inicia diretamente o executável nativo empacotado
  em `outputs\win-unpacked\pulsecord.exe`, sem PowerShell ou processo auxiliar;
- verificação clean-room disponível em `npm run verify:independence`.
- compartilhamento de tela por seletor próprio do PulseCord, com abas para
  telas e aplicativos, miniaturas locais atualizadas enquanto o seletor está
  aberto e escolha explícita;
  no Windows, o áudio do sistema é fornecido quando solicitado pelo Discord.
- gravador de atalhos aceita teclas simples e combinações, inclusive letras,
  números da fileira superior e teclado numérico, sujeitos à disponibilidade do
  registro global do Windows.
- identidade de mídia compatível com Chromium na janela e na sessão, mantendo a
  classificação desktop na API e no Gateway sem anunciar a ponte proprietária
  `DiscordNative`.
- reforço de robustez após auditoria de pontos frágeis: alerta único no console
  quando o formato de `X-Super-Properties` ou do payload `IDENTIFY` do Gateway
  muda e deixa de ser reconhecido; instalação do patch de identidade do Gateway
  agora só ocorre quando a página carregada é um domínio confiável do Discord;
  seleção de fontes de tela tem timeout de 8s para não travar indefinidamente
  em `desktopCapturer.getSources`; validação de remetente IPC via `file://`
  passou a exigir o caminho exato de `offline.html`; falhas reais do `reg.exe`
  ao limpar autostart legado agora são logadas em vez de silenciadas; arquivos
  de settings colocados em quarentena por corrupção são limitados a 3 cópias
  mais recentes.

## Funcionalidades em andamento

- Nenhuma implementação de produto em andamento neste momento.

## Planejado

- Modelo seguro para plugins externos: manifestos, permissões, assinaturas e
  isolamento de falhas antes de executar JavaScript de terceiros;
- evolução da biblioteca de temas e experiência de personalização;
- testes automatizados mais amplos para integrações visíveis do Discord;
- instalador e fluxo de release somente após autorização explícita e validação
  de segurança/distribuição.

## Decisões técnicas e limites

- Clean-room é obrigatório: não usar código, base ou runtime de outros clientes
  modificados sem autorização explícita.
- O aplicativo usa o Discord oficial na web; integrações de interface dependem
  do DOM público disponível e devem ser tratadas como camada de compatibilidade.
- A captura de tela usa exclusivamente APIs públicas do Electron. O seletor
  apresenta telas e aplicativos com miniaturas locais; não há cópia de UI ou
  runtime de outros clientes.
- O atalho de desenvolvimento é uma inicialização direta do executável
  empacotado. Após alterações no código, `npm run package:dir` deve ser usado
  antes de testar pelo atalho; o próprio atalho nunca executa PowerShell.
- Plugins externos permanecem desabilitados por projeto; a área Plugins informa
  que o recurso está em construção.
- Não há instalador ou release pública nesta fase; o repositório publica fonte.
- A marca do PulseCord é própria; o símbolo do Discord permanece somente como
  atribuição de serviço, conforme `BRAND_ASSETS.md`.

## Bugs conhecidos e validação pendente

- Em 28/07/2026, a conta autenticada entrou no canal `Geral 1` do servidor
  FiveMCleaner e o compartilhamento foi validado até o seletor nativo do
  PulseCord, que enumerou `Tela 1` e `Tela 2`; nenhuma transmissão foi iniciada.
- A causa raiz do bloqueio “Baixe o app” era o User-Agent da página anunciar
  tokens `Discord/*` e `Electron/*`. Isso direcionava a interface para o caminho
  proprietário que exige `window.DiscordNative`, ponte que não existe e não
  deve ser imitada na arquitetura clean-room. A página agora usa a rota WebRTC
  compatível com Chromium; API e Gateway continuam classificados como desktop.
- O Windows não apresentou dispositivo PnP das classes `Camera` ou `Image` na
  validação de 28/07/2026. Portanto, o controle de câmera permanece
  indisponível neste computador por ausência de hardware/driver detectável, não
  por bloqueio de navegador do PulseCord.
- A API pública de seleção de mídia do Electron escolhe a fonte de captura, mas
  não permite ao shell alterar qualidade ou FPS de uma transmissão Discord já
  ativa. Esses parâmetros continuam sob controle do Discord/WebRTC; o PulseCord
  não afirma oferecer alteração em tempo real sem uma API pública para isso.
- O antigo launcher PowerShell falhava em 28/07/2026 ao resolver o caminho de
  `electron.exe`; ele foi removido e substituído pelo atalho direto ao
  executável empacotado.

## Git e publicação

- `main` aponta para `0b0695d`; `dev/proxima-versao` recebe a governança,
  identidade visual, captura de tela e inicializador nativo atuais.
- A antiga branch `codex/clean-room-core` foi integrada e removida local/remota.
- A PR #1 foi integrada em `main`.
- Todo desenvolvimento futuro ocorre em `dev/proxima-versao`.
- Push de desenvolvimento é somente backup/sincronização e não altera `main`,
  versão, tag, release, instalador ou site.

## Validações conhecidas

- `npm run check`: typecheck e verificação da independência clean-room;
- `npm run build`: gera os bundles locais em `dist/`;
- `npm run package:dir`: gera pacote local unpacked em `outputs/`;
- `npm run shortcut:windows`: cria/atualiza o atalho de desenvolvimento.

## Próximos passos

1. Executar qualquer nova funcionalidade exclusivamente em `dev/proxima-versao`.
2. Manter este arquivo atualizado a cada mudança técnica relevante.
3. Projetar a segurança de plugins externos antes de habilitar instalações.
4. Evoluir o seletor de compartilhamento para janelas/aplicativos, mantendo a
   aprovação explícita do usuário e o limite de origem confiável.
5. Manter releases e instaladores fora de escopo até pedido explícito do usuário.
