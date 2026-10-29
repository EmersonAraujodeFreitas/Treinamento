# Servidor do site de Treinamento (Cloudflare Worker + D1)

O servidor confere usuário e senha, entrega a cada perfil **só** os dados que ele pode ver e recusa gravações sem permissão. Nenhum dado fica no GitHub.

## Implantação pelo painel da Cloudflare (sem instalar nada)

1. **Banco de dados**
   - Painel da Cloudflare → *Storage & Databases* → *D1 SQL Database* → **Create** → nome `treinamento`.
   - Abra o banco → aba **Console** → cole todo o conteúdo de `schema.sql` → **Execute**.
2. **Worker**
   - *Workers & Pages* → **Create** → *Create Worker* → nome `treinamento-inovacao-casa` → **Deploy**.
   - **Edit code** → apague o código de exemplo → cole todo o conteúdo de `src/index.js` → **Deploy**.
3. **Ligar o banco ao Worker**
   - No Worker → *Settings* → *Bindings* → **Add** → *D1 database* → Variable name `DB` → banco `treinamento` → **Save**.
4. **Segredos e variáveis** (Worker → *Settings* → *Variables and Secrets* → **Add**)
   - `SEGREDO_SESSAO` — tipo **Secret** — um texto aleatório com 40 caracteres ou mais.
   - `PIMENTA` — tipo **Secret** — outro texto aleatório com 40 caracteres ou mais.
   - `ORIGENS` — tipo **Text** — `https://emersonaraujodefreitas.github.io`
   - Depois de salvar, clique em **Deploy** de novo se o painel pedir.
5. **Ligar o site ao servidor**
   - Copie o endereço do Worker (ex.: `https://treinamento-inovacao-casa.SEU-USUARIO.workers.dev`).
   - Coloque em `assets/config.js` (`window.TREINAMENTO_API = '…'`) ou, na tela de entrada do site, em *Configurar servidor*.
6. **Primeiro acesso**: entre logo com `EMERSON` / `12345678`. O site obriga a criar uma senha nova na hora.

> Nunca troque `SEGREDO_SESSAO` ou `PIMENTA` depois de criar usuários: trocar a `PIMENTA` invalida todas as senhas e trocar o `SEGREDO_SESSAO` desconecta todo mundo.

## O que o servidor garante

- Senhas guardadas só como hash (PBKDF2 + segredo do servidor); nunca saem do servidor.
- Sessão assinada, conferida no banco a cada pedido. Desativar um usuário, trocar o perfil ou a senha derruba a sessão na hora.
- Cada perfil recebe apenas os conjuntos de dados das guias liberadas; o resto nem chega ao navegador.
- Gravação, edição e exclusão conferidas pela permissão do perfil.
- 5 senhas erradas bloqueiam o usuário por 15 minutos.
- Só o endereço do site (`ORIGENS`) pode usar a API pelo navegador.
- Registro de acessos e alterações (Administrativo → Registro de acessos).
- Ao clicar em **Sair**, os dados são apagados do computador.

Plano gratuito: até 100 mil pedidos por dia no Worker e 5 GB no D1.
