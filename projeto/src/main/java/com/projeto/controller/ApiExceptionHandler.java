package com.projeto.controller;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> validacao(MethodArgumentNotValidException exception) {
        Map<String, String> erros = new LinkedHashMap<>();
        for (FieldError erro : exception.getBindingResult().getFieldErrors()) {
            erros.putIfAbsent(erro.getField(), erro.getDefaultMessage());
        }
        return resposta(HttpStatus.BAD_REQUEST, "Dados inválidos.", erros);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> erroHttp(ResponseStatusException exception) {
        return resposta(HttpStatus.valueOf(exception.getStatusCode().value()), exception.getReason(), null);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> jsonInvalido() {
        return resposta(HttpStatus.BAD_REQUEST, "Formato de requisição inválido.", null);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> conflitoDeDados() {
        return resposta(HttpStatus.CONFLICT, "A operação conflita com os dados existentes.", null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> erroInterno(Exception exception) {
        // Do not include request values, exception messages, or stack traces in the API response or logs.
        log.error("Request failed with exception type {}", exception.getClass().getSimpleName());
        return resposta(HttpStatus.INTERNAL_SERVER_ERROR, "Não foi possível concluir a operação.", null);
    }

    private ResponseEntity<Map<String, Object>> resposta(HttpStatus status, String mensagem, Object detalhes) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mensagem", mensagem);
        if (detalhes != null) body.put("detalhes", detalhes);
        return ResponseEntity.status(status).body(body);
    }
}
