package com.projeto.service;

import com.projeto.model.Usuario;
import com.projeto.repository.UsuarioRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/** Writes minimal audit metadata; never includes names, contact details, clinical notes, or credentials. */
@Service
public class AuditoriaService {
    private static final Logger log = LoggerFactory.getLogger(AuditoriaService.class);
    private final UsuarioRepository usuarios;

    public AuditoriaService(UsuarioRepository usuarios) {
        this.usuarios = usuarios;
    }

    public void registrar(String evento, String recurso, Long recursoId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String ator = "anonimo";
        if (authentication != null && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken)) {
            ator = usuarios.findByEmailIgnoreCase(authentication.getName())
                    .map(Usuario::getId).map(String::valueOf).orElse("desconhecido");
        }
        log.info("AUDIT event={} actorId={} resource={} resourceId={}", evento, ator, recurso,
                recursoId == null ? "-" : recursoId);
    }
}
