# Regras de Trabalho para IAs — PulseCord

## Autoridade e objetivo

Este arquivo define o procedimento obrigatório para qualquer IA que trabalhe no
PulseCord. Ele tem precedência sobre conveniências de implementação e deve ser
lido integralmente antes de qualquer alteração. `PROJECT_STATE.md` registra o
estado operacional atual; `docs/ARCHITECTURE.md` registra decisões técnicas
duradouras. Código, testes e histórico Git são a fonte de verdade quando houver
divergência documental.

O PulseCord é um shell desktop independente e de código aberto para o serviço
Discord. A política de clean-room em `docs/CLEAN_ROOM_POLICY.md` é obrigatória:
não importar, copiar, empacotar, baixar ou executar código de outros clientes
ou modificações de Discord sem autorização explícita, registrada e revisada.

## Sequência obrigatória de toda tarefa

1. Ler integralmente este arquivo.
2. Ler integralmente `PROJECT_STATE.md`.
3. Verificar `git status -sb`, histórico recente e diferenças relevantes.
4. Inspecionar o código, os contratos e os testes ligados à tarefa.
5. Implementar somente o escopo solicitado, preservando mudanças existentes.
6. Atualizar `PROJECT_STATE.md` quando a tarefa alterar estado relevante.
7. Executar as validações aplicáveis e corrigir regressões introduzidas.
8. Revisar o diff e criar um único commit local lógico e profissional.

Nunca descartar, sobrescrever, resetar ou limpar alterações sem identificar
origem, impacto e autorização. Não misturar refatorações ou limpezas não
relacionadas na mesma tarefa.

## Git e commits

- Todo desenvolvimento acontece em `dev/proxima-versao`.
- `main` representa exclusivamente o estado estável já integrado/publicado.
- Ao encerrar uma tarefa concluída, criar automaticamente um commit local.
- Cada commit deve ser atômico, descritivo e conter somente arquivos da tarefa.
- Antes do commit, verificar `git diff --check`, arquivos acidentais, segredos,
  builds, caches e dados locais.
- Não reescrever histórico, fazer force-push, squash ou apagar branches sem
  solicitação explícita do usuário.

## Operações remotas

Commit local não autoriza operação remota. Push, tag, release, instalador,
deploy ou publicação de site exigem autorização explícita nesta tarefa.

### Push de desenvolvimento

Quando o usuário solicitar explicitamente um “push de desenvolvimento” ou
equivalente inequívoco:

- enviar somente a branch de desenvolvimento atual, normalmente
  `dev/proxima-versao`;
- não tocar `main`, tags, releases, site, instalador ou changelog público;
- não criar Pull Request automaticamente;
- não alterar versão do aplicativo ou metadados de distribuição;
- preservar integralmente o histórico remoto.

Esse push é apenas backup, sincronização entre agentes e continuidade do
desenvolvimento; ele não constitui publicação oficial.

### Publicação oficial

Somente iniciar quando o usuário pedir explicitamente uma publicação, release
ou lançamento oficial. Antes de publicar:

1. Revisar código, documentação e mudanças acumuladas desde a última tag.
2. Executar build, testes, typecheck, lint e validações de pacote aplicáveis.
3. Determinar a próxima versão por SemVer, com base nas mudanças reais.
4. Atualizar todos os metadados de versão, changelog e artefatos envolvidos.
5. Integrar integralmente `dev/proxima-versao` em `main`, salvo se a igualdade
   de commits e conteúdo for comprovada por `git log` e `git diff`.
6. Criar tag, publicar `main`, tag e somente os artefatos autorizados.
7. Validar, quando tecnicamente possível, o caminho de atualização completo.
8. Sincronizar `dev/proxima-versao` com a `main` publicada e retornar para ela.

## Versionamento SemVer

- **patch**: correções compatíveis, segurança, ajustes internos ou visuais.
- **minor**: novas capacidades públicas compatíveis.
- **major**: mudança incompatível de contrato, instalação, atualização ou dados.

Documentação de governança (`AI_RULES.md` e documentos correlatos) e
`PROJECT_STATE.md` não justificam, por si só, uma nova versão pública.

## Documentação e memória permanente

- `AI_RULES.md` muda raramente e somente para regras estáveis.
- `PROJECT_STATE.md` deve evoluir com decisões, arquitetura, funcionalidades,
  limitações, bugs conhecidos e próximos passos.
- `docs/ARCHITECTURE.md` registra decisões de arquitetura que precisam durar.
- Atualizar a documentação no mesmo commit da mudança que ela descreve.
- Não afirmar validação, suporte ou segurança sem evidência verificável.

## Limites de atuação

- Não coletar, pedir ou armazenar senha, token ou credencial do Discord.
- Não enfraquecer isolamento, sandbox, validação IPC ou política clean-room.
- Não publicar instalador, release ou código de terceiros sem autorização
  explícita.
- Não prometer funcionamento de atualização, plugin externo ou integração que
  não tenha sido testada.
- Ao encontrar incerteza relevante, registrar a limitação em `PROJECT_STATE.md`
  e pedir orientação antes de expandir o escopo.

## Validação mínima

Para mudanças de código TypeScript/Electron, executar ao menos `npm run check`
(typecheck, suíte de testes em `tests/` via `npm run test`, e verificação
clean-room, nessa ordem); incluir `npm run build` e `npm run package:dir`
quando a mudança afetar pacote, processo principal, inicialização ou
recursos. Para documentação, validar o diff e a coerência com a árvore e o
estado Git atuais.

Toda lógica pura e testável sem um runtime Electron real (validadores em
`shared/contracts.ts`, `SettingsStore`, o motor `PulseCore`, funções puras do
main process) deve ganhar cobertura de teste em `tests/` ao ser criada ou
alterada de forma relevante. Testes vivem em `tests/`, espelhando a estrutura
de `src/`, e rodam via `node --test` sobre um bundle esbuild (`npm run
test`); não é necessário um runtime Electron real para rodá-los.
