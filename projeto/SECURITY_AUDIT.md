# Auditoria de segurança — VidaSaúde

Auditoria realizada sobre o backend Spring Boot/H2 e o frontend integrado em 11/11/2026. Os testes foram executados com bancos H2 temporários em memória; a base local `data/clinica` não foi consultada nem alterada.

## Achados e classificação

| Risco | Estado | Achado |
|---|---|---|
| **Crítico** | Pendente | Todas as contas autenticadas recebem o mesmo papel `USER`. Como o cadastro é público, qualquer conta recém-criada pode consultar/alterar pacientes e agendamentos da clínica. Não existem papéis de administrador/profissional/paciente, vínculo de titularidade ou isolamento por clínica; IDs não são autorização. Não foi inventado um mapeamento ou promovida uma conta publicamente a administradora porque isso exigiria regra de negócio e migração/backfill seguros. |
| **Alto** | Corrigido | CSRF estava desabilitado com autenticação por sessão/cookie. CSRF agora é exigido em operações mutáveis; o endpoint de token e o frontend integrado usam o padrão cookie/header. |
| **Alto** | Corrigido | APIs não tinham rate limit. Há limite de 120 requisições por minuto por endereço e limite de 10 tentativas de login/cadastro a cada 15 minutos, com resposta `429` e `Retry-After`. É por processo, não distribuído. |
| **Alto** | Corrigido | Console H2 estava habilitado. Foi desabilitado e a rota foi explicitamente negada. |
| **Alto** | Parcial | Agendamento verificava conflito antes de inserir sem serialização de concorrência. A verificação passou a bloquear a linha de configuração da agenda durante a transação. Não substitui um constraint/reservas apropriados para bancos multi-instância com estados cancelados. |
| **Alto** | Pendente | Não existe recuperação de senha. Não há serviço de e-mail, política de revogação de sessões ou fluxo de token de recuperação; gerar um token sem canal seguro de entrega seria ineficaz. |
| **Alto** | Pendente | A base local é H2 em arquivo, com usuário `sa` e senha vazia por padrão. O perfil `prod` agora exige credenciais/URL por ambiente e `ddl-auto=validate`, mas é necessária migração para banco de produção com controles, backups criptografados e recuperação testada. |
| **Alto** | Pendente | Não há política nem automação verificável de backup, criptografia, retenção e restauração. |
| **Médio** | Corrigido | Configurações de CORS estavam fixadas em origens locais. Agora são configuráveis por `APP_CORS_ALLOWED_ORIGINS` e continuam usando allowlist explícita com credenciais. |
| **Médio** | Corrigido | Cookies de sessão não tinham configuração explícita de segurança e mensagens de erro do servidor podiam revelar detalhes. Configuração de sessão, `SameSite=Strict`, `HttpOnly`, duração, cookies `Secure` no perfil de produção, CSP e respostas genéricas foram aplicadas. |
| **Médio** | Corrigido | Logs de auditoria não existiam. Eventos de acesso/alteração e autenticação agora registram identificadores e ações sem nomes, contatos, observações clínicas, senhas, tokens ou conteúdo da requisição. Os logs ainda precisam de armazenamento protegido, retenção e monitoramento operacional. |
| **Médio** | Corrigido | A data de nascimento não rejeitava datas futuras e o tamanho máximo em bytes aceito por BCrypt não era verificado. Foram adicionadas validações no servidor. |
| **Médio** | Pendente | Não há política/fluxos para exportação, eliminação e retenção dos dados; dependem de definição LGPD e preservação de registros legalmente necessários. |
| **Baixo** | Corrigido | Cabeçalhos anti-frame, `nosniff`, CSP, política de referenciador e cache restritivo foram habilitados pela configuração do Spring Security. |
| **Baixo** | Sem evidência | Consultas JPA são derivadas/parametrizadas; endpoints usam DTOs em vez de binding arbitrário de entidades. Não foi encontrado upload implementado. O frontend escapa conteúdo dinâmico antes de montar HTML. |

## Correções nesta branch

- CSRF ativado com token cookie/header e integração no frontend atual.
- Rate limit de APIs (120/min) e limite mais estrito de login/cadastro (10/15 min), sessão HTTP-only/SameSite e cookies Secure em produção.
- Desativação/negação do console H2, allowlist CORS por ambiente e propriedades de produção sem migração automática de schema.
- Bloqueio de linha de configuração durante a verificação de conflito dos agendamentos.
- Validações adicionais, tratamento de erro sem detalhes internos e auditoria mínima sem dados clínicos.
- Testes de cadastro/login/sessão/hash, autenticação obrigatória, CSRF, console H2, rate limit de API/login, conflito concorrente de horário e liberação após cancelamento.

## Escopo não resolvido / recomendações

1. Definir papéis reais (administração, profissional, recepção e paciente), processo de provisionamento seguro de administradores e quais recursos cada papel pode consultar/alterar. Associar registros ao titular/organização e migrar os registros existentes com mapeamento revisado antes de liberar dados clínicos. Até essa alteração, não expor o sistema a usuários não confiáveis.
2. Escolher um provedor de e-mail transacional; implementar token de recuperação aleatório, hash no armazenamento, expiração/uso único, resposta anti-enumeração e revogação de sessões após reset.
3. Substituir o H2 por banco de produção gerenciado e incluir seu driver JDBC compatível na migração. Aplicar usuário de banco com privilégio mínimo, conexão TLS, migrações versionadas e backups criptografados com testes regulares de restauração. Não alterar a base local sem backup e plano de migração.
4. Usar rate limit compartilhado no gateway, além do limite local, configurar TLS/HTTPS, origem de produção e secrets fora de arquivos versionados. Confirmar rotação de qualquer segredo que tenha sido publicado historicamente.
5. Armazenar auditoria em destino protegido, com retenção definida, acesso restrito, alertas e política LGPD. Os IDs de registros também são dados pseudonimizados e requerem proteção.
6. Revisar a política de coleta/retensão, exportação e exclusão de dados pessoais e clínicos; avaliar criptografia em repouso e controles de acesso a observações clínicas.
7. Executar análise de dependências SCA atualizada no pipeline de CI e revisar avisos de versão/segurança do Spring Boot e transitivas antes do deploy. O `dependency:tree` foi coletado; OWASP Dependency-Check não conseguiu obter a base NVD (chave ausente/inválida e falha de confiança TLS no acesso), portanto não há resultado confiável de CVEs nesta auditoria.

## Testes

- `./mvnw.cmd test "-Dspring.datasource.url=jdbc:h2:mem:securityaudit;DB_CLOSE_DELAY=-1" -Dspring.jpa.hibernate.ddl-auto=create-drop`
- Resultado final: **10 testes passaram; 0 falhas; 0 erros**. Inclui cadastro/login/hash/sessão, acesso sem login, CSRF, console H2, limites de API/login, concorrência de agendamento e cancelamento/remarcação.
- `node --check src/main/resources/static/app.js` — passou.
- `git diff --check` — passou (avisos apenas sobre conversão local LF/CRLF).
- OWASP Dependency-Check foi tentado, mas não gerou relatório por indisponibilidade da base NVD nesta execução.
