# VidaSaúde — backend

API REST em Java 21, Spring Boot, Spring Data JPA e H2. Os dados locais são gravados em `projeto/data/clinica`.

## Executar

Na pasta `projeto`, com Maven instalado:

```sh
mvn spring-boot:run
```

A aplicação inicia em `http://localhost:8080` e serve o frontend integrado em `src/main/resources/static`. Não é necessário iniciar um servidor Node separado.

## API

- Autenticação: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Pacientes: `GET /api/pacientes?busca=...`, `GET /api/pacientes/{id}`, `POST /api/pacientes`, `PUT /api/pacientes/{id}`, `GET /api/pacientes/{id}/agendamentos`
- Agenda: `GET /api/agendamentos?data=AAAA-MM-DD`, `GET /api/agendamentos/canceladas`, `POST /api/agendamentos`, `PATCH /api/agendamentos/{id}/status`
- Configurações e relatórios: `GET/PUT /api/configuracoes/agenda`, `GET /api/relatorios`

As rotas de negócio exigem uma sessão autenticada. As senhas são armazenadas com BCrypt; validações e conflitos são retornados como erros HTTP 4xx. Requisições que alteram dados precisam enviar o token CSRF obtido em `GET /api/auth/csrf`, no cabeçalho `X-XSRF-TOKEN`; a interface integrada faz isso automaticamente.

## Execução em produção

Ative o perfil `prod` e forneça `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` e `APP_CORS_ALLOWED_ORIGINS` pelo ambiente de execução/secret manager. O perfil exige uma URL de banco explícita, valida o schema sem alterá-lo, desativa o console H2 e força cookies de sessão `Secure`, `HttpOnly` e `SameSite=Strict`. Configure HTTPS no proxy de entrada e permita somente as origens reais do frontend. Não use o H2 local como banco de produção; migre para um banco gerenciado com usuário de privilégio mínimo, backups cifrados e restauração testada.

O limitador de autenticação deste código é local ao processo; ambientes com múltiplas instâncias devem aplicar também rate limiting compartilhado no proxy/gateway. Leia `SECURITY_AUDIT.md` antes de expor a aplicação: segregação por função e por clínica, envio de recuperação de senha e gestão de auditoria/retensão ainda precisam de decisões e infraestrutura.
