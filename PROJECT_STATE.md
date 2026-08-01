# Estado do Projeto — PulseCord

_Atualizado em 01/08/2026._

## Objetivo

PulseCord está em reformulação para ser um ambiente desktop próprio — não mais
"a janela do Discord com extras por cima". O Discord passa a ser um serviço
conectado, renderizado dentro de um painel do shell do PulseCord, que tem sua
própria navegação e, com o tempo, suas próprias telas (central de atividade,
organização, automações, biblioteca de temas, plugins, comandos, painéis e
configurações). O "aperto de mão": PulseCord tem identidade e recursos
próprios, mas não finge ser nem substitui o protocolo privado do Discord — o
Discord real (API, Gateway, nuvem de amigos/servidores/Nitro) continua sendo
usado como está.

Esse pivô está em andamento por marcos independentes, cada um com seu próprio
ciclo desenho→implementação→validação. Marcos entregues: o esqueleto do shell
(nav própria + Discord como painel interno), a Central de Atividade e a
Biblioteca de Temas. Os próximos marcos (cada tela nova) ainda não têm data.

O checkout canônico é `C:\Projetos\PulseCord`. O repositório remoto é
`marquezinii/PulseCord` e a branch de desenvolvimento ativa é
`dev/proxima-versao`.

## Arquitetura e tecnologias

- Electron 41 (decisão deliberada, não vamos migrar para Tauri/Wails — ver
  "Decisões técnicas e limites"), Node.js 24+, npm 11+, TypeScript 6 e esbuild;
- processos separados: `src/main`, `src/preload`, `src/shell`, `src/renderer`
  e `src/shared`;
- a `BrowserWindow` principal carrega o shell próprio do PulseCord
  (`static/shell.html`); o Discord é renderizado numa `WebContentsView`
  separada, embutida como painel dentro da área de conteúdo do shell — não é
  mais a janela inteira;
- IPC versionado, estreito e validado no processo principal, com allowlist
  explícita de páginas locais confiáveis (`shell.html`, `offline.html`);
- `PulseCore` para ciclo de vida de plugins first-party com capacidades
  limitadas e limpeza reversível;
- `PulsePanel` em Shadow DOM fechado, hoje ainda dentro do painel do Discord;
  integração de configurações sem importar módulos privados do Discord;
- persistência local atômica, schema versionado, recuperação por safe mode e
  atalhos globais registrados explicitamente pelo usuário.

A descrição arquitetural detalhada está em `docs/ARCHITECTURE.md`. Segurança,
API de plugins, roadmap e política clean-room estão em `docs/`.

## Estrutura relevante

- `src/main`: janela do shell, view de serviço (Discord embutido), segurança,
  IPC, persistência, atalhos e recuperação;
- `src/preload`: ponte restrita entre a página do Discord e o processo
  principal (usada pela `WebContentsView` de serviço);
- `src/shell`: chrome nativo do PulseCord (nav lateral hoje; `static/shell.html`
  é o HTML estático correspondente);
- `src/renderer`: PulsePanel, branding, configurações, temas e PulseCore
  (`src/renderer/pulsecore`: motor de plugins first-party) — injetado dentro
  da página do Discord, dentro da view de serviço;
- `src/shared`: contratos versionados compartilhados, incluindo
  `shell-layout.ts` (geometria da nav, compartilhada entre main e shell);
- `assets` e `build`: identidade visual e ícones do produto;
- `scripts`: build, testes, verificação clean-room e launcher de
  desenvolvimento;
- `docs`: decisões e políticas técnicas;
- `outputs`: pacotes locais gerados, sem publicação automática.

## Funcionalidades concluídas

- App Electron com login no domínio oficial do Discord, sem coleta de senha;
- identidade desktop do PulseCord, sem ponte privada de outro cliente;
- categoria PulseCord nas configurações do Discord: Plugins e PulseCord
  Shortcuts (Temas saiu daqui e virou tela própria do shell);
- biblioteca de temas em CSS local (tela própria do shell), com persistência
  explícita, safe mode e bloqueio de imports/recursos remotos;
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
- PulseCore foi reconstruído do zero em `src/renderer/pulsecore/` (motor de
  plugins first-party original, sem qualquer semelhança com Vencord/Equicord
  ou outros clientes modificados): capacidades declaradas (`dom`, `events`,
  `settings`, `commands`) só ficam acessíveis no contexto do plugin que as
  declarou; toda função registrada por um plugin roda isolada, e um erro em
  tempo de execução desativa e limpa somente aquele plugin, preservando o
  restante do shell; `dom.patch(seletor, aplicar)` reaplica/desfaz mudanças
  conforme elementos do Discord aparecem/somem, sem o plugin reimplementar
  `MutationObserver`; cada plugin ganhou armazenamento próprio persistido
  (`AppSettings.pluginData`, schema versão 4 na época; hoje 5) e um `CommandRegistry`
  compartilhado para nomear ações que integrações futuras (paleta de
  comandos, atalhos) poderão acionar sem alterar o motor. Continua sem
  nenhum plugin first-party habilitado; o motor está pronto, mas ainda vazio.
- **Marco 1 do pivô de ambiente próprio: esqueleto do shell.** A janela
  principal não carrega mais `discord.com/app` diretamente; carrega
  `static/shell.html` (`src/shell/`), e o Discord passa a rodar numa
  `WebContentsView` separada (`src/main/service-view.ts`), embutida como
  painel dentro da área de conteúdo, à direita de uma nav lateral própria
  (`src/shared/shell-layout.ts` define a largura, compartilhada entre main e
  shell para não desalinhar). A nav mostra 5 destinos futuros (Central de
  Atividade, Organização, Automações, Temas, Configurações) como placeholders
  explicitamente desabilitados — nenhuma tela de conteúdo nova foi construída
  ainda, por decisão de escopo deste marco. `isTrustedIpcSender` passou a
  reconhecer duas páginas locais confiáveis por caminho exato (`shell.html`,
  `offline.html`) em vez de uma só. Atalhos globais continuam focando/exibindo
  a janela do shell, mas entregam eventos de teclado para a view do Discord
  especificamente. PulsePanel e todo o PulseCore continuam intactos, agora
  hospedados dentro da view de serviço em vez da janela inteira — nenhuma
  regressão funcional, só nova casa. Validado visualmente: nav renderiza,
  Discord carrega e autentica dentro do painel, redimensionamento (incluindo
  maximizar) mantém nav e painel do Discord alinhados sem sobreposição nem
  espaço morto.
- **Marco 2 do pivô: Central de Atividade.** Primeira tela de conteúdo própria
  do shell (`src/shell/activity.ts`). Clicar num destino manda
  `IPC.shellNavigate` para o main, que **desanexa** (não destrói) a
  `WebContentsView` do Discord — sessão, chamada de voz e estado do PulseCore
  sobrevivem à ida e volta. A tela separa visivelmente dois tipos de fato: o
  que o PulseCord sabe de si (versão, modo seguro, atalhos, tema, plugins —
  autoritativo) e o que conseguiu observar do Discord. Sem token e sem API do
  Discord (proibido pelo `AI_RULES.md`, e autenticar como cliente não-oficial
  violaria os termos do Discord e arriscaria a conta do usuário), a leitura vem
  do título da página, onde o Discord já publica o total desduplicado como
  prefixo `(3) ` — somar os badges visíveis seria mais frágil e simplesmente
  errado, já que uma menção é marcada no canal, no ícone do servidor e na pasta
  ao mesmo tempo. `ActivitySnapshot.mentions` é `number | null`: `null`
  significa "não foi possível ler" e nunca é colapsado com `0` ("o Discord diz
  que não há") — a tela mostra `—` com explicação em vez de um zero que nunca
  observou. `isShellPageSender` (mais estreito que `isTrustedIpcSender`) impede
  que a própria página do Discord chame os canais que podem escondê-la.
  Leituras não são persistidas: descrevem uma sessão viva, e reexibir a
  contagem de ontem na inicialização afirmaria algo não observado desde então.
- **Marco 3 do pivô: Biblioteca de Temas.** O editor de CSS saiu de dentro das
  configurações do Discord e virou tela própria do shell
  (`src/shell/themes.ts`); o card "Temas" do PulsePanel foi removido junto,
  para não haver duas portas para a mesma coisa. Schema subiu para 5:
  `ThemeSettings` deixou de ser `{enabled, customCss}` e virou biblioteca —
  `{themes: [{id, name, css}], activeThemeId}`, até 10 temas, no máximo 1
  aplicado. `activeThemeId` é a única fonte de verdade sobre "tem tema
  ligado", sem flag `enabled` paralela para dessincronizar. Migração de v4:
  o CSS existente vira um tema chamado "Meu tema" (o trabalho do usuário não
  é descartado) e só nasce aplicado se estava aplicado antes. **Não há mais
  preview ao vivo**: na tela Temas o Discord fica escondido, então estilizar
  "enquanto digita" mexeria em algo que o usuário não vê — aplicar é ato
  explícito, e o resultado aparece ao voltar para o Discord. Aplicar agora
  cruza fronteira de processo: shell edita, main grava e empurra o CSS
  resolvido para a view do Discord via `IPC.themeChanged`. O CSS é validado
  no main antes de gravar **e de novo** no runtime antes de injetar, porque é
  o runtime que de fato escreve na página. Os canais de tema são fechados com
  `isShellPageSender`: a própria página do Discord não pode reescrever o CSS
  que é injetado nela.

## Funcionalidades em andamento

- Nenhuma implementação de produto em andamento neste momento. Próximo passo
  do pivô de ambiente próprio é escolher e desenhar o próximo marco de
  conteúdo (Organização, Automações ou Painel de Configurações unificado),
  como um sub-projeto independente com seu próprio ciclo de desenho.

## Planejado

Pivô de ambiente próprio (PulseCord como ambiente com Discord como serviço
conectado, não mais como app que É o Discord) — cada item abaixo é um marco
independente, um de cada vez, cada um com seu próprio desenho antes de
implementar:

- Organização: espaço próprio de workspace, fora do modelo Discord;
- Automações: automações permitidas pelo usuário sobre eventos do Discord;
- Painel de Configurações unificado: mover Plugins/Atalhos (hoje dentro das
  settings do Discord) e o PulsePanel para viver nas telas do shell, como
  Temas já foi;
- Modelo seguro para plugins externos: manifestos, permissões, assinaturas e
  isolamento de falhas antes de executar JavaScript de terceiros;
- instalador e fluxo de release somente após autorização explícita e validação
  de segurança/distribuição.

## Decisões técnicas e limites

- Decisão de 01/08/2026: permanecer em Electron em vez de migrar para
  Tauri/Wails. Motivo: o PulseCord depende pesado de APIs específicas de
  Chromium/Electron já testadas e auditadas (`desktopCapturer`,
  `setDisplayMediaRequestHandler`, reescrita de headers via
  `session.webRequest`, `sendInputEvent`), que são mais fracas ou inconsistentes
  entre SOs nos webviews nativos que Tauri/Wails usam. Trocar de runtime no
  meio do pivô de ambiente próprio duplicaria o risco arquitetural. Revisitar
  isoladamente se RAM/tamanho de instalador virar problema real depois de
  rodando — não junto com outra mudança grande.
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

- `npm run check`: typecheck, suíte de testes (`npm run test`) e verificação
  da independência clean-room, nessa ordem;
- `npm run test`: roda `tests/**/*.test.ts` (68 testes) via `node --test`
  sobre um bundle esbuild; não precisa de um runtime Electron real;
- `npm run build`: gera os bundles locais em `dist/`;
- `npm run package:dir`: gera pacote local unpacked em `outputs/`;
- `npm run shortcut:windows`: cria/atualiza o atalho de desenvolvimento.

## Cobertura de testes

Primeira rodada de testes do projeto (antes não havia nenhum), em `tests/`,
espelhando `src/`: validadores e `sanitizeSettings` de `shared/contracts.ts`;
`isTrustedIpcSender`/`isTrustedDiscordUrl` e o rewrite de identidade de
`X-Super-Properties` no main process; `SettingsStore` completo contra um
diretório temporário real em disco (CRUD de atalhos, tema, dados por plugin,
quarentena de arquivo corrompido e sua rotação); e o motor `PulseCore`
completo (`EventBus`, `CommandRegistry`, `PluginRuntime`) contra um documento
`jsdom` e uma bridge falsa — cobrindo especificamente as garantias centrais
do motor: isolamento de capacidades, ordem de limpeza de recursos, e que uma
falha em runtime de um plugin não afeta os demais.

Escrever os testes de `isCustomCss` revelou um bug real de produção: uma
URL `blob:` legítima (que sempre embute a origem que a criou, ex.
`blob:https://discord.com/<uuid>`) era rejeitada porque a checagem genérica
contra `//` rodava sobre o CSS inteiro, incluindo o conteúdo já validado de
dentro de `url(...)`. Corrigido em `shared/contracts.ts`: a checagem de `//`
agora roda apenas fora dos trechos `url(...)` já validados contra a lista
de esquemas permitidos (`data:`, `blob:`, `#`).

O marco 2 acrescentou: `activity-reading.ts` (leitura do título, incluindo a
distinção entre "zero observado" e "não foi possível ler", formatos `99+` e
milhar agrupado, e títulos que não devem ser confundidos com o prefixo de
não-lidas); `ActivityStore` (cópias defensivas, notificação, descarte de
leitura mais antiga que a atual, `clear()` marcando indisponível em vez de
zero, subscriber que lança sem derrubar os demais); `activity-reporter.ts`
(deduplicação de leitura idêntica, reação a mudança de título, parada após
`destroy()`); `renderActivityScreen` (garantia de que nunca renderiza número
sem leitura, e recuperação de indisponível para contagem real); e navegação
do shell (seleção, destino ativo, destinos desabilitados não reportam nada).

O marco 3 acrescentou: migração de schema 4 para 5 (tema legado ligado
continua ligado; tema legado salvo mas desligado é preservado sem aplicar;
tema legado inválido é descartado), sanitização da biblioteca (ids/nomes/CSS
inválidos removidos, `activeThemeId` pendurado limpo, cap de `MAX_THEMES` e
ids duplicados), `activeThemeCss`, `isThemeName`, as operações de biblioteca
do `SettingsStore` (criar/editar/aplicar/remover, incluindo remover o tema
aplicado e os limites), e a tela Temas (recusa salvar sem nome ou com CSS
remoto sem sequer chamar o main; criar e então editar o mesmo tema em vez de
duplicar; aplicar/desaplicar; falha de gravação reportada em vez de fingir
sucesso; nome de tema renderizado como texto, nunca como markup).

Não testado por design (exigiria um processo Electron real em execução):
`main/index.ts` (chama `app.whenReady()` no carregamento do módulo), o
anexar/desanexar da `WebContentsView` em `window.ts`, e as chamadas
Electron-nativas dentro de `chooseDisplaySource` e
`disablePulseCordAutoStart`. Essas partes continuam cobertas pelo smoke test
manual do app empacotado descrito na validação mínima.

## Próximos passos

1. Executar qualquer nova funcionalidade exclusivamente em `dev/proxima-versao`.
2. Manter este arquivo atualizado a cada mudança técnica relevante.
3. Projetar a segurança de plugins externos antes de habilitar instalações.
4. Evoluir o seletor de compartilhamento para janelas/aplicativos, mantendo a
   aprovação explícita do usuário e o limite de origem confiável.
5. Manter releases e instaladores fora de escopo até pedido explícito do usuário.
