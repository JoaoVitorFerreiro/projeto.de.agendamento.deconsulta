package com.projeto.service;

import com.projeto.dto.AgendamentoRequest;
import com.projeto.dto.AgendamentoResponse;
import com.projeto.dto.StatusRequest;
import com.projeto.model.Agendamento;
import com.projeto.model.ConfiguracaoAgenda;
import com.projeto.model.Paciente;
import com.projeto.repository.AgendamentoRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class AgendamentoService {
    private static final Set<String> STATUS_PERMITIDOS = Set.of("agendado", "em atendimento", "concluído", "cancelado");
    private final AgendamentoRepository agendamentos;
    private final PacienteService pacientes;
    private final ConfiguracaoAgendaService configuracoes;
    private final AuditoriaService auditoria;

    public AgendamentoService(AgendamentoRepository agendamentos, PacienteService pacientes,
            ConfiguracaoAgendaService configuracoes, AuditoriaService auditoria) {
        this.agendamentos = agendamentos;
        this.pacientes = pacientes;
        this.configuracoes = configuracoes;
        this.auditoria = auditoria;
    }

    @Transactional(readOnly = true)
    public List<AgendamentoResponse> listar(LocalDate data) {
        auditoria.registrar("APPOINTMENTS_ACCESSED", "appointment-collection", null);
        List<Agendamento> resultados = data == null ? agendamentos.findAllByOrderByDataDescHoraAsc()
                : agendamentos.findByDataOrderByHoraAsc(data);
        return resultados.stream().map(AgendamentoResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<AgendamentoResponse> cancelados() {
        auditoria.registrar("CANCELLED_APPOINTMENTS_ACCESSED", "appointment-collection", null);
        return agendamentos.findByStatusOrderByDataDescHoraAsc("cancelado")
                .stream().map(AgendamentoResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<AgendamentoResponse> historico(Long pacienteId) {
        pacientes.buscar(pacienteId);
        auditoria.registrar("PATIENT_APPOINTMENT_HISTORY_ACCESSED", "patient", pacienteId);
        return agendamentos.findByPaciente_IdOrderByDataDescHoraDesc(pacienteId)
                .stream().map(AgendamentoResponse::from).toList();
    }

    public AgendamentoResponse criar(AgendamentoRequest dados) {
        validarHorario(dados);
        Paciente paciente = pacientes.buscar(dados.pacienteId());
        LocalDate ultimaConsulta = agendamentos
                .findByPaciente_IdAndStatusAndDataLessThanEqualOrderByDataDescHoraDesc(
                        paciente.getId(), "concluído", dados.data())
                .stream().map(Agendamento::getData).findFirst().orElse(null);
        String tipo = ultimaConsulta != null && ChronoUnit.DAYS.between(ultimaConsulta, dados.data()) <= 30
                ? "retorno" : "consulta";
        Agendamento criado = agendamentos.save(new Agendamento(paciente, dados.data(), dados.hora(), tipo));
        auditoria.registrar("APPOINTMENT_CREATED", "appointment", criado.getId());
        return AgendamentoResponse.from(criado);
    }

    public AgendamentoResponse atualizarStatus(Long id, StatusRequest dados) {
        String status = dados.status().trim().toLowerCase();
        if (!STATUS_PERMITIDOS.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status de consulta inválido.");
        }
        Agendamento agendamento = agendamentos.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Agendamento não encontrado."));
        agendamento.setStatus(status);
        agendamento.setMotivoCancelamento(status.equals("cancelado") ? dados.motivoCancelamento() : null);
        Agendamento atualizado = agendamentos.save(agendamento);
        auditoria.registrar(status.equals("cancelado") ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_STATUS_UPDATED",
                "appointment", atualizado.getId());
        return AgendamentoResponse.from(atualizado);
    }

    private void validarHorario(AgendamentoRequest dados) {
        if (dados.data().isBefore(LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Não é possível agendar em uma data passada.");
        }
        ConfiguracaoAgenda cfg = configuracoes.obterParaAgendamento();
        var horarioDia = cfg.getDiasFuncionamento().get(dados.data().getDayOfWeek());
        if (horarioDia == null || !horarioDia.isAberto()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A clínica não atende nesta data.");
        }
        if (dados.hora().isBefore(horarioDia.getHorarioInicio()) || !dados.hora().isBefore(horarioDia.getHorarioFim())
                || ChronoUnit.MINUTES.between(horarioDia.getHorarioInicio(), dados.hora()) % cfg.getIntervaloMinutos() != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha um horário válido do funcionamento.");
        }
        if (agendamentos.existsByDataAndHoraAndStatusNot(dados.data(), dados.hora(), "cancelado")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este horário já está ocupado.");
        }
    }
}
