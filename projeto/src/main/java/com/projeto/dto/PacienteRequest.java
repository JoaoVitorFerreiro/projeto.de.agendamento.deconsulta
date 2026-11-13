package com.projeto.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Past;
import java.time.LocalDate;

public record PacienteRequest(
        @NotBlank @Size(max = 120) String nomeCompleto,
        @NotBlank @Size(max = 30) String telefone,
        @NotBlank @Size(max = 40) String convenio,
        @Past LocalDate dataNascimento,
        @Size(max = 255) String endereco,
        @Size(max = 100) String naturalidade,
        @Size(max = 30) String estadoCivil,
        @Email @Size(max = 255) String email,
        @Size(max = 2000) String observacao) {
    public PacienteRequest(String nomeCompleto, String telefone, String convenio, LocalDate dataNascimento,
            String email, String observacao) {
        this(nomeCompleto, telefone, convenio, dataNascimento, null, null, null, email, observacao);
    }
}
