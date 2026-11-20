package com.projeto.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.time.LocalTime;

@Embeddable
public class DiaFuncionamento {
    @Column(name = "aberto", nullable = false)
    private boolean aberto;

    @Column(name = "horario_inicio")
    private LocalTime horarioInicio;

    @Column(name = "horario_fim")
    private LocalTime horarioFim;

    protected DiaFuncionamento() {}

    public DiaFuncionamento(boolean aberto, LocalTime horarioInicio, LocalTime horarioFim) {
        this.aberto = aberto;
        this.horarioInicio = horarioInicio;
        this.horarioFim = horarioFim;
    }

    public boolean isAberto() { return aberto; }
    public void setAberto(boolean aberto) { this.aberto = aberto; }
    public LocalTime getHorarioInicio() { return horarioInicio; }
    public void setHorarioInicio(LocalTime horarioInicio) { this.horarioInicio = horarioInicio; }
    public LocalTime getHorarioFim() { return horarioFim; }
    public void setHorarioFim(LocalTime horarioFim) { this.horarioFim = horarioFim; }
}
