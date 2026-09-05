# FSOC Track Lab — Security Audit Report

**Date:** 2026-09-05
**Scope:** Client-side React/TypeScript simulation application
**Architecture:** Static SPA (no backend, no database, no server-side logic)

---

## Executive Summary

FSOC Track Lab is a client-only simulation application with a minimal attack surface. The audit found **no critical or high-severity vulnerabilities**. Three medium-severity issues were identified and remediated, and three low-severity informational findings are noted.

**Final state:** 0 npm vulnerabilities, 266/266 algorithm tests pass, 101/101 security tests pass.

---

## Findings & Remediation

### FIXED — Medium Severity

| # | Finding | Location | Fix |
|---|---------|----------|-----|
| 1 | **HTML Report XSS** — Report template interpolated user-controlled config names without escaping. A malicious config name like `<script>alert(1)</script>` would execute in the browser when the HTML report is viewed. | `ReportModal.tsx` | Added `escapeHtml()` utility. All interpolated config names, trajectory values, stats values, and benchmark context values are now HTML-escaped before template insertion. |
| 2 | **CSV Injection** — CSV exports passed user-controlled strings directly into cells. Spreadsheet apps interpret leading `=`, `+`, `-`, `@` as formulas, enabling command execution when the CSV is opened. | `PerformanceView.tsx`, `ScenariosLogsView.tsx`, `BenchmarkView.tsx`, `benchmarkRunner.ts` | Added `sanitizeCsvCell()` / `sanitizeCsvRow()` in `csvSanitize.ts`. Dangerous leading characters are prefixed with `'` (standard CSV-safe escape). |
| 3 | **Input Validation Bypass** — Simulation config accepted NaN, Infinity, negative, and extreme values without validation, causing undefined behavior in physics calculations and potential infinite loops. | `simulationEngine.ts`, `benchmarkRunner.ts` | Added `validateSimulationConfig()` with `clamp()` bounds for all numeric parameters, trajectory validation, and boolean field normalization. Called at benchmark entry point. |

### FIXED — Low Severity

| # | Finding | Location | Fix |
|---|---------|----------|-----|
| 4 | **Unused Dependencies** — `@google/genai` and `express` were listed in `package.json` but never imported. These increased the dependency tree and introduced known vulnerabilities (qs, body-parser). | `package.json` | Removed `@google/genai`, `express`, `dotenv`, and `@types/express`. Reduced from 121 to 94 packages. **npm audit: 0 vulnerabilities.** |

### Informational — Not Fixed (Accepted Risk)

| # | Finding | Risk | Rationale |
|---|---------|------|-----------|
| 5 | **Google Fonts CDN** — External font loading from `fonts.googleapis.com` in `index.html`. Potential privacy/tracking concern. | Low | Fonts are a UX requirement. No API keys transmitted. User can self-host fonts if privacy is critical. |
| 6 | **Dev Server Binding** — `vite.config.ts` dev server binds to `0.0.0.0`, exposing the dev server on the local network. | Low | Development-only setting. Does not apply to production builds. Standard Vite behavior. |
| 7 | **`.env.example` Contains Key Placeholder** — `GEMINI_API_KEY` placeholder exists but is unused in source code. | Informational | No actual key is committed. `.env*` is gitignored. Placeholder has no runtime effect. |

---

## Audit Methodology

### Architecture Assessment (Phases 1-3)
- **Network layer:** Zero `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource` calls in source code. No API endpoints, no external data transmission.
- **Storage layer:** Zero `localStorage`, `sessionStorage`, `IndexedDB`, or cookie usage. State is in-memory React state only.
- **Build layer:** Vite production build generates static HTML/CSS/JS. No server-side rendering. No SSR data leakage.

### Threat Model (Phase 3)
- **Attack vectors:** User imports config name → rendered in HTML report; user opens CSV in spreadsheet; simulation config enters physics engine.
- **Mitigations:** HTML escaping, CSV sanitization, input validation — all implemented.

### Dependency Audit (Phase 7)
- Pre-fix: 3 moderate vulnerabilities (qs, body-parser, express chain)
- Post-fix: **0 vulnerabilities** after removing unused `express` dependency

### Browser Security (Phase 10)
- CSP: Not set (acceptable for static SPA with no inline scripts beyond Vite's runtime)
- No `eval()`, `Function()`, `innerHTML`, `dangerouslySetInnerHTML`, `document.write()`
- No `postMessage` or cross-origin communication
- No `<iframe>` or `<object>` embedding

---

## Test Results

| Suite | Result |
|-------|--------|
| TypeScript lint (`tsc --noEmit`) | ✅ PASS |
| Vite production build | ✅ PASS (375.30 kB JS, 42.41 kB CSS) |
| Algorithm correctness (266 assertions) | ✅ 266/266 PASS |
| Security validation (101 assertions) | ✅ 101/101 PASS |
| npm audit | ✅ 0 vulnerabilities |

### Security Test Coverage
- **CSV injection prevention:** 19 tests — dangerous values neutralized, safe values preserved
- **HTML escaping:** 16 tests — XSS payloads escaped, normal text unchanged
- **Input validation:** 19 tests — NaN, Infinity, negative, extreme values clamped; valid values preserved
- **No secrets in exports:** 26 tests — CSV and HTML exports free of API key patterns
- **XSS in config names:** 10 tests — malicious config names HTML-escaped
- **Config identity preserved:** 11 tests — valid config properties pass through unchanged

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/ReportModal.tsx` | Added `escapeHtml()`, applied to all template interpolations |
| `src/services/csvSanitize.ts` | **New file** — `sanitizeCsvCell()` and `sanitizeCsvRow()` |
| `src/components/PerformanceView.tsx` | Imported and applied CSV sanitization |
| `src/components/ScenariosLogsView.tsx` | Imported and applied CSV sanitization |
| `src/components/BenchmarkView.tsx` | Imported and applied CSV sanitization |
| `src/services/benchmarkRunner.ts` | Imported CSV sanitization and config validation |
| `src/services/simulationEngine.ts` | Added `validateSimulationConfig()` with `clamp()` |
| `src/services/__tests__/securityValidation.ts` | **New file** — 101 security assertions |
| `package.json` | Removed unused `@google/genai`, `express`, `dotenv`, `@types/express` |

---

## Conclusion

FSOC Track Lab's client-only architecture provides a strong security baseline. The three remediated findings (XSS, CSV injection, input validation) have been fixed with minimal code changes and no algorithm regression. The application is in a good security posture for its intended use as a local simulation tool.
