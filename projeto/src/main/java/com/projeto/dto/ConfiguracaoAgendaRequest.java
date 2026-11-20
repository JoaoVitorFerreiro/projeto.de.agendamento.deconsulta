package com.projeto.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Map;

public record ConfiguracaoAgendaRequest(
        @NotNull LocalTime horarioInicio,
        @NotNull LocalTime horarioFim,
        @NotNull @Positive Integer intervaloMinutos,
        Map<DayOfWeek, DiaFuncionamentoRequest> diasFuncionamento) {
    public ConfiguracaoAgendaRequest(LocalTime horarioInicio, LocalTime horarioFim, Integer intervaloMinutos) {
        this(horarioInicio, horarioFim, intervaloMinutos, null);
    }

    public record DiaFuncionamentoRequest(boolean aberto, LocalTime horarioInicio, LocalTime horarioFim) {}
}
