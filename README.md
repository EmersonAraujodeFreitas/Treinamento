# Treinamento · Inovação Casa

Site da área de treinamento para a **formação inicial de turmas** de habilitação ao call center.

- **Cadastro de formação** – dados do treinando, endereço (sempre Bahia, com busca automática nos 417 municípios e bairros vinculados à cidade), perfil de vendas ou não vendas, atestados com as datas, notas das provas, últimas notas da qualidade, avaliação comportamental e nota final (calculada ou digitada).
- **Dashboard** – filtros por turma, período, Salvador / fora de Salvador / RMS / interior, cidade, bairro, perfil, situação, atestado, faixa etária e signo; ranking de bairros, panorama completo por bairro, comparativos e bairros de Salvador ainda sem treinandos.
- **Base de dados** – busca, edição, exclusão, exportação em CSV, backup e importação.

Os dados ficam salvos no navegador (localStorage). Use **Baixar backup** com frequência.

Para publicar: Settings → Pages → Deploy from branch → `main` / root.

## Acesso e segurança

O site exige usuário e senha. Os dados ficam num servidor próprio (pasta `worker/`, Cloudflare Worker + D1), que confere a senha e entrega a cada perfil só o que ele pode ver. Veja `worker/LEIA-ME.md` para implantar. Enquanto o endereço do servidor não estiver em `assets/config.js`, o site funciona só no navegador do administrador.
