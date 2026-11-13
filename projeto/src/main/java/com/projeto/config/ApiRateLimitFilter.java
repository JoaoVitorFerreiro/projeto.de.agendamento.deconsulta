package com.projeto.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.web.filter.OncePerRequestFilter;

/** Per-process request limits; use an edge/shared limiter in multi-node deployments. */
final class ApiRateLimitFilter extends OncePerRequestFilter {
    private static final int MAX_API_REQUESTS = 120;
    private static final long API_WINDOW_NANOS = Duration.ofMinutes(1).toNanos();
    private static final int MAX_AUTH_ATTEMPTS = 10;
    private static final long AUTH_WINDOW_NANOS = Duration.ofMinutes(15).toNanos();
    private static final int MAX_TRACKED_ADDRESSES = 10_000;
    private final ConcurrentHashMap<String, Window> apiRequests = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Window> authAttempts = new ConcurrentHashMap<>();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return "OPTIONS".equalsIgnoreCase(request.getMethod())
                || !request.getRequestURI().startsWith(request.getContextPath() + "/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long now = System.nanoTime();
        String address = request.getRemoteAddr();
        long retryAfter = consume(apiRequests, address, MAX_API_REQUESTS, API_WINDOW_NANOS, now);

        String path = request.getRequestURI();
        if (retryAfter == 0 && "POST".equalsIgnoreCase(request.getMethod())
                && (path.equals(request.getContextPath() + "/api/auth/login")
                        || path.equals(request.getContextPath() + "/api/auth/register"))) {
            retryAfter = consume(authAttempts, address, MAX_AUTH_ATTEMPTS, AUTH_WINDOW_NANOS, now);
        }

        if (retryAfter > 0) {
            response.setStatus(429);
            response.setHeader("Retry-After", Long.toString(retryAfter));
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"mensagem\":\"Muitas requisições. Aguarde antes de tentar novamente.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private long consume(ConcurrentHashMap<String, Window> windows, String address, int limit,
            long windowNanos, long now) {
        AtomicBoolean allowed = new AtomicBoolean(true);
        if (!windows.containsKey(address) && windows.size() >= MAX_TRACKED_ADDRESSES) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startedAt >= windowNanos);
            if (!windows.containsKey(address) && windows.size() >= MAX_TRACKED_ADDRESSES) {
                allowed.set(false);
            }
        }
        if (!allowed.get()) return 1;

        windows.compute(address, (key, current) -> {
            if (current == null || now - current.startedAt >= windowNanos) return new Window(now, 1);
            if (current.count >= limit) {
                allowed.set(false);
                return current;
            }
            return new Window(current.startedAt, current.count + 1);
        });
        if (allowed.get()) return 0;
        Window current = windows.get(address);
        return current == null ? 1 : Math.max(1, (current.startedAt + windowNanos - now + 999_999_999L) / 1_000_000_000L);
    }

    private record Window(long startedAt, int count) {}
}
