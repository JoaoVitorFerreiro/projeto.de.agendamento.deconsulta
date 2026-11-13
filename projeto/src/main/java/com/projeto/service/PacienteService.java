package com.projeto.service;

import com.projeto.dto.PacienteRequest;
import com.projeto.model.Paciente;
import com.projeto.repository.PacienteRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class PacienteService {
    private static final List<String> CONVENIOS = List.of("Santa Saúde", "Unimed", "Particular");
    private final PacienteRepository pacientes;
    private final AuditoriaService auditoria;

    public PacienteService(PacienteRepository pacientes, AuditoriaService auditoria) {
        this.pacientes = pacientes;
        this.auditoria = auditoria;
    }

    @Transactional(readOnly = true)
    public List<Paciente> listar(String busca) {
        auditoria.registrar("PATIENT_LIST_ACCESSED", "patient-collection", null);
        if (busca == null || busca.isBlank()) return pacientes.findAllByOrderByNomeCompletoAsc();
        String termo = busca.trim();
        return pacientes.findByNomeCompletoContainingIgnoreCaseOrTelefoneContainingOrConvenioContainingIgnoreCase(
                termo, termo, termo);
    }

    @Transactional(readOnly = true)
    public Paciente buscar(Long id) {
        Paciente paciente = pacientes.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Paciente não encontrado."));
        auditoria.registrar("PATIENT_RECORD_ACCESSED", "patient", id);
        return paciente;
    }

    public Paciente criar(PacienteRequest dados) {
        validarConvenio(dados.convenio());
        Paciente paciente = pacientes.save(new Paciente(limpar(dados.nomeCompleto()), limpar(dados.telefone()),
                dados.convenio().trim(), dados.dataNascimento(), limparOpcional(dados.endereco()),
                limparOpcional(dados.naturalidade()), limparOpcional(dados.estadoCivil()),
                limparOpcional(dados.email()), limparOpcional(dados.observacao())));
        auditoria.registrar("PATIENT_CREATED", "patient", paciente.getId());
        return paciente;
    }

    public Paciente atualizar(Long id, PacienteRequest dados) {
        validarConvenio(dados.convenio());
        Paciente paciente = buscar(id);
        paciente.setNomeCompleto(limpar(dados.nomeCompleto()));
        paciente.setTelefone(limpar(dados.telefone()));
        paciente.setConvenio(dados.convenio().trim());
        paciente.setDataNascimento(dados.dataNascimento());
        paciente.setEndereco(limparOpcional(dados.endereco()));
        paciente.setNaturalidade(limparOpcional(dados.naturalidade()));
        paciente.setEstadoCivil(limparOpcional(dados.estadoCivil()));
        paciente.setEmail(limparOpcional(dados.email()));
        paciente.setObservacao(limparOpcional(dados.observacao()));
        Paciente atualizado = pacientes.save(paciente);
        auditoria.registrar("PATIENT_UPDATED", "patient", atualizado.getId());
        return atualizado;
    }

    private void validarConvenio(String convenio) {
        if (convenio == null || !CONVENIOS.contains(convenio.trim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Convênio deve ser Santa Saúde, Unimed ou Particular.");
        }
    }

    private String limpar(String valor) { return valor == null ? null : valor.trim(); }
    private String limparOpcional(String valor) {
        String limpo = limpar(valor);
        return limpo == null || limpo.isBlank() ? null : limpo;
    }
}
