package com.projeto;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import com.projeto.dto.AgendamentoRequest;
import com.projeto.dto.ConfiguracaoAgendaRequest;
import com.projeto.dto.PacienteRequest;
import com.projeto.dto.StatusRequest;
import com.projeto.repository.AgendamentoRepository;
import com.projeto.service.AgendamentoService;
import com.projeto.service.ConfiguracaoAgendaService;
import com.projeto.service.PacienteService;
import com.projeto.repository.UsuarioRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.EnumMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import jakarta.servlet.http.Cookie;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:securitytests;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@AutoConfigureMockMvc
class SecurityHardeningTests {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private PacienteService pacientes;
    @Autowired
    private AgendamentoService agendamentos;
    @Autowired
    private ConfiguracaoAgendaService configuracoes;
    @Autowired
    private UsuarioRepository usuarios;
    @Autowired
    private AgendamentoRepository agendamentoRepository;

    @Test
    void patientDataRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/pacientes"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.mensagem").value("Autenticação necessária."));
    }

    @Test
    void csrfTokenEndpointReturnsCookieAndToken() throws Exception {
        mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void publicRegistrationRejectsRequestsWithoutCsrf() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"Conta teste\",\"email\":\"csrf@example.test\",\"senha\":\"senha-forte-123\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void h2ConsoleIsNotAccessibleOverHttp() throws Exception {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken("test@example.test", "n/a",
                List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);

        mockMvc.perform(get("/h2-console").session(session))
                .andExpect(status().isForbidden());
    }

    @Test
    void registrationHashesPasswordAndCreatesAnAuthenticatedSession() throws Exception {
        var tokenResponse = mockMvc.perform(get("/api/auth/csrf")).andReturn().getResponse();
        Cookie csrfCookie = tokenResponse.getCookie("XSRF-TOKEN");
        String csrfToken = tokenResponse.getContentAsString().replaceAll("^.*\\\"token\\\":\\\"([^\\\"]+)\\\".*$", "$1");

        var registration = mockMvc.perform(post("/api/auth/register")
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"Conta teste\",\"email\":\"auth-flow@example.test\",\"senha\":\"senha-forte-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senhaHash").doesNotExist())
                .andReturn();

        var usuario = usuarios.findByEmailIgnoreCase("auth-flow@example.test").orElseThrow();
        assertNotEquals("senha-forte-123", usuario.getSenhaHash());
        MockHttpSession session = (MockHttpSession) registration.getRequest().getSession(false);
        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("auth-flow@example.test"));

        var loginTokenResponse = mockMvc.perform(get("/api/auth/csrf").session(session)).andReturn().getResponse();
        Cookie loginCsrfCookie = loginTokenResponse.getCookie("XSRF-TOKEN");
        String loginCsrfToken = loginTokenResponse.getContentAsString()
                .replaceAll("^.*\\\"token\\\":\\\"([^\\\"]+)\\\".*$", "$1");
        mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .cookie(loginCsrfCookie)
                        .header("X-XSRF-TOKEN", loginCsrfToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"auth-flow@example.test\",\"senha\":\"senha-forte-123\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void loginAttemptsAreLimitedPerRemoteAddress() throws Exception {
        var tokenResponse = mockMvc.perform(get("/api/auth/csrf")).andReturn().getResponse();
        Cookie csrfCookie = tokenResponse.getCookie("XSRF-TOKEN");
        String csrfToken = tokenResponse.getContentAsString().replaceAll("^.*\\\"token\\\":\\\"([^\\\"]+)\\\".*$", "$1");

        for (int attempt = 0; attempt < 10; attempt++) {
            mockMvc.perform(post("/api/auth/login")
                            .cookie(csrfCookie)
                            .header("X-XSRF-TOKEN", csrfToken)
                            .with(request -> {
                                request.setRemoteAddr("203.0.113.77");
                                return request;
                            })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"missing@example.test\",\"senha\":\"senha-invalida\"}"))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/auth/login")
                        .cookie(csrfCookie)
                        .header("X-XSRF-TOKEN", csrfToken)
                        .with(request -> {
                            request.setRemoteAddr("203.0.113.77");
                            return request;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"missing@example.test\",\"senha\":\"senha-invalida\"}"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void apiRequestsAreRateLimitedPerRemoteAddress() throws Exception {
        for (int requestNumber = 0; requestNumber < 120; requestNumber++) {
            mockMvc.perform(get("/api/auth/csrf").with(request -> {
                        request.setRemoteAddr("203.0.113.78");
                        return request;
                    }))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(get("/api/auth/csrf").with(request -> {
                    request.setRemoteAddr("203.0.113.78");
                    return request;
                }))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void concurrentRequestsCannotBookTheSameSlotTwice() throws Exception {
        var paciente = pacientes.criar(new PacienteRequest(
                "Paciente de teste", "11999990000", "Particular", null, null, null));
        LocalDate data = LocalDate.now().plusDays(1);
        while (data.getDayOfWeek() == DayOfWeek.SATURDAY || data.getDayOfWeek() == DayOfWeek.SUNDAY) {
            data = data.plusDays(1);
        }
        var pedido = new AgendamentoRequest(paciente.getId(), data, LocalTime.of(9, 0));
        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var primeira = executor.submit(() -> tentarAgendar(pedido, start));
            var segunda = executor.submit(() -> tentarAgendar(pedido, start));
            start.countDown();
            assertEquals(1, (primeira.get() ? 1 : 0) + (segunda.get() ? 1 : 0));
            var existente = agendamentoRepository.findAll().get(0);
            var cancelado = agendamentos.atualizarStatus(existente.getId(), new StatusRequest("cancelado", "teste"));
            assertEquals("cancelado", cancelado.status());
            var remarcado = agendamentos.criar(pedido);
            assertEquals(pedido.hora(), remarcado.hora());
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void patientRecordDetailsArePersisted() {
        var created = pacientes.criar(new PacienteRequest("Paciente com ficha", "11988887777", "Unimed",
                LocalDate.of(1990, 3, 12), "Rua das Flores, 123", "São Paulo/SP", "Casado(a)", null, null));

        var loaded = pacientes.buscar(created.getId());

        assertEquals("Rua das Flores, 123", loaded.getEndereco());
        assertEquals("São Paulo/SP", loaded.getNaturalidade());
        assertEquals("Casado(a)", loaded.getEstadoCivil());
    }

    @Test
    @Transactional
    void weeklyScheduleCanOpenAndBookOnSelectedDays() {
        var days = new EnumMap<DayOfWeek, ConfiguracaoAgendaRequest.DiaFuncionamentoRequest>(DayOfWeek.class);
        for (DayOfWeek day : DayOfWeek.values()) {
            days.put(day, new ConfiguracaoAgendaRequest.DiaFuncionamentoRequest(false, null, null));
        }
        days.put(DayOfWeek.SUNDAY, new ConfiguracaoAgendaRequest.DiaFuncionamentoRequest(
                true, LocalTime.of(10, 0), LocalTime.of(12, 0)));
        var saved = configuracoes.atualizar(new ConfiguracaoAgendaRequest(
                LocalTime.of(10, 0), LocalTime.of(12, 0), 30, days));
        assertEquals(true, saved.getDiasFuncionamento().get(DayOfWeek.SUNDAY).isAberto());
        assertEquals(false, saved.getDiasFuncionamento().get(DayOfWeek.MONDAY).isAberto());

        var paciente = pacientes.criar(new PacienteRequest(
                "Paciente de domingo", "11977776666", "Particular", null, null, null));
        LocalDate sunday = LocalDate.now().plusDays(1);
        while (sunday.getDayOfWeek() != DayOfWeek.SUNDAY) sunday = sunday.plusDays(1);
        var agendamento = agendamentos.criar(new AgendamentoRequest(
                paciente.getId(), sunday, LocalTime.of(10, 0)));
        assertEquals(sunday, agendamento.data());
    }

    private boolean tentarAgendar(AgendamentoRequest pedido, CountDownLatch start) throws InterruptedException {
        start.await();
        try {
            agendamentos.criar(pedido);
            return true;
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode().value() != 409) throw exception;
            return false;
        }
    }
}
