package com.projeto.repository;

import com.projeto.model.ConfiguracaoAgenda;
import jakarta.persistence.LockModeType;
import java.util.List;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ConfiguracaoAgendaRepository extends JpaRepository<ConfiguracaoAgenda, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from ConfiguracaoAgenda c order by c.id")
    List<ConfiguracaoAgenda> findAllForUpdate();
}
