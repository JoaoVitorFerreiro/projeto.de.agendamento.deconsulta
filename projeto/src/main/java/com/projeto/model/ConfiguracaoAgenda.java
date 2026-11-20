package com.projeto.model;

import jakarta.persistence.Entity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.EnumType;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapKeyColumn;
import jakarta.persistence.MapKeyEnumerated;
import jakarta.persistence.Table;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.EnumMap;
import java.util.Map;

@Entity
@Table(name = "configuracao_agenda")
public class ConfiguracaoAgenda {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private LocalTime horarioInicio;
    private LocalTime horarioFim;
    private Integer intervaloMinutos;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "configuracao_agenda_dias", joinColumns = @JoinColumn(name = "configuracao_id"))
    @MapKeyColumn(name = "dia_semana", length = 16)
    @MapKeyEnumerated(EnumType.STRING)
    private Map<DayOfWeek, DiaFuncionamento> diasFuncionamento = new EnumMap<>(DayOfWeek.class);

    protected ConfiguracaoAgenda() {}

    public ConfiguracaoAgenda(LocalTime horarioInicio, LocalTime horarioFim, Integer intervaloMinutos) {
        this.horarioInicio = horarioInicio;
        this.horarioFim = horarioFim;
        this.intervaloMinutos = intervaloMinutos;
        this.diasFuncionamento = diasPadrao(horarioInicio, horarioFim);
    }

    public static Map<DayOfWeek, DiaFuncionamento> diasPadrao(LocalTime inicio, LocalTime fim) {
        Map<DayOfWeek, DiaFuncionamento> dias = new EnumMap<>(DayOfWeek.class);
        for (DayOfWeek dia : DayOfWeek.values()) {
            boolean aberto = dia != DayOfWeek.SATURDAY && dia != DayOfWeek.SUNDAY;
            dias.put(dia, new DiaFuncionamento(aberto, inicio, fim));
        }
        return dias;
    }

    public Long getId() { return id; }
    public LocalTime getHorarioInicio() { return horarioInicio; }
    public void setHorarioInicio(LocalTime horarioInicio) { this.horarioInicio = horarioInicio; }
    public LocalTime getHorarioFim() { return horarioFim; }
    public void setHorarioFim(LocalTime horarioFim) { this.horarioFim = horarioFim; }
    public Integer getIntervaloMinutos() { return intervaloMinutos; }
    public void setIntervaloMinutos(Integer intervaloMinutos) { this.intervaloMinutos = intervaloMinutos; }
    public Map<DayOfWeek, DiaFuncionamento> getDiasFuncionamento() { return diasFuncionamento; }
    public void setDiasFuncionamento(Map<DayOfWeek, DiaFuncionamento> diasFuncionamento) {
        if (this.diasFuncionamento == null) this.diasFuncionamento = new EnumMap<>(DayOfWeek.class);
        else this.diasFuncionamento.clear();
        if (diasFuncionamento != null) this.diasFuncionamento.putAll(diasFuncionamento);
    }
}
