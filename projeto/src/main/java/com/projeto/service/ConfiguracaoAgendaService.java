package com.projeto.service;

import com.projeto.dto.ConfiguracaoAgendaRequest;
import com.projeto.model.ConfiguracaoAgenda;
import com.projeto.model.DiaFuncionamento;
import com.projeto.repository.ConfiguracaoAgendaRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import java.time.LocalTime;
import java.time.DayOfWeek;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class ConfiguracaoAgendaService {
    private static final Set<Integer> INTERVALOS_PERMITIDOS = Set.of(15, 30, 60);
    private final ConfiguracaoAgendaRepository configuracoes;
    private final AuditoriaService auditoria;

    public ConfiguracaoAgendaService(ConfiguracaoAgendaRepository configuracoes, AuditoriaService auditoria) {
        this.configuracoes = configuracoes;
        this.auditoria = auditoria;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void inicializarConfiguracaoSeNecessario() {
        if (configuracoes.count() == 0) {
            configuracoes.save(new ConfiguracaoAgenda(LocalTime.of(9, 0), LocalTime.of(18, 0), 15));
        }
    }

    public ConfiguracaoAgenda obter() {
        ConfiguracaoAgenda configuracao = configuracoes.findAll().stream().findFirst().orElseGet(() ->
                configuracoes.save(new ConfiguracaoAgenda(LocalTime.of(9, 0), LocalTime.of(18, 0), 15)));
        inicializarDiasLegados(configuracao);
        auditoria.registrar("SCHEDULE_CONFIGURATION_ACCESSED", "schedule-configuration", configuracao.getId());
        return configuracao;
    }

    public ConfiguracaoAgenda obterParaAgendamento() {
        ConfiguracaoAgenda configuracao = configuracoes.findAllForUpdate().stream().findFirst().orElseGet(() ->
                configuracoes.save(new ConfiguracaoAgenda(LocalTime.of(9, 0), LocalTime.of(18, 0), 15)));
        inicializarDiasLegados(configuracao);
        return configuracao;
    }

    public ConfiguracaoAgenda atualizar(ConfiguracaoAgendaRequest dados) {
        validar(dados);
        ConfiguracaoAgenda atual = obter();
        atual.setHorarioInicio(dados.horarioInicio());
        atual.setHorarioFim(dados.horarioFim());
        atual.setIntervaloMinutos(dados.intervaloMinutos());
        atual.setDiasFuncionamento(normalizarDias(dados));
        ConfiguracaoAgenda atualizada = configuracoes.save(atual);
        auditoria.registrar("SCHEDULE_CONFIGURATION_UPDATED", "schedule-configuration", atualizada.getId());
        return atualizada;
    }

    private void validar(ConfiguracaoAgendaRequest dados) {
        if (!dados.horarioInicio().isBefore(dados.horarioFim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O horário final deve ser após o inicial.");
        }
        if (dados.intervaloMinutos() == null || !INTERVALOS_PERMITIDOS.contains(dados.intervaloMinutos())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "O intervalo deve ser 15, 30 ou 60 minutos.");
        }
        normalizarDias(dados);
    }

    private Map<DayOfWeek, DiaFuncionamento> normalizarDias(ConfiguracaoAgendaRequest dados) {
        Map<DayOfWeek, DiaFuncionamento> normalizados = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek dia : DayOfWeek.values()) {
            ConfiguracaoAgendaRequest.DiaFuncionamentoRequest pedido = dados.diasFuncionamento() == null
                    ? null : dados.diasFuncionamento().get(dia);
            boolean aberto = pedido == null
                    ? dados.diasFuncionamento() == null && dia != DayOfWeek.SATURDAY && dia != DayOfWeek.SUNDAY
                    : pedido.aberto();
            LocalTime inicio = pedido == null || pedido.horarioInicio() == null
                    ? dados.horarioInicio() : pedido.horarioInicio();
            LocalTime fim = pedido == null || pedido.horarioFim() == null
                    ? dados.horarioFim() : pedido.horarioFim();
            if (aberto && (inicio == null || fim == null || !inicio.isBefore(fim))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Informe horários válidos para cada dia marcado como aberto.");
            }
            normalizados.put(dia, new DiaFuncionamento(aberto, inicio, fim));
        }
        return normalizados;
    }

    private void inicializarDiasLegados(ConfiguracaoAgenda configuracao) {
        if (configuracao.getDiasFuncionamento() == null || configuracao.getDiasFuncionamento().isEmpty()) {
            configuracao.setDiasFuncionamento(ConfiguracaoAgenda.diasPadrao(
                    configuracao.getHorarioInicio(), configuracao.getHorarioFim()));
            configuracoes.save(configuracao);
        }
    }
}
