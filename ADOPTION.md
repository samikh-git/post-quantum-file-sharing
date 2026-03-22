# Before production adoption

This repository is a **reference implementation** of a post-quantum–style encrypted drop flow. **Do not treat it as production-ready** for high-stakes or regulated workloads until it has been **stress tested** and **independently audited** in *your* environment, on *your* threat model, and against *your* compliance obligations.

The sections below describe what “ready for adoption” should mean in practice—not a checklist you can tick without evidence.

---

## Stress testing (why and what)

Stress testing validates behavior under **concurrency**, **sustained load**, and **failure modes** that unit tests do not cover. For this stack, you care about the **Express API**, **Supabase** (Postgres, Auth, Storage), **rate limits**, and **browser** behavior—not a single number (“10k RPS”) in isolation.

### What to model

1. **Authenticated owner paths** — `GET /me/boxes`, `GET /me/boxes/:id/files`, box creation, file confirm/download prep. Simulate many concurrent owners or a single owner with bursty refreshes (dashboard polling patterns).
2. **Public / anonymous paths** — `GET /boxes/:username/:slug`, `GET /boxes/check/...`, `POST .../uploads` and the follow-up **Storage PUT** to signed URLs. These are the natural abuse surface (enumeration, upload spam, oversized bodies).
3. **Auth token churn** — Supabase access tokens refresh; ensure your tests use realistic token lifetimes and do not assume a single static JWT for long runs.
4. **Storage and DB limits** — Large numbers of **PENDING** files, concurrent uploads to the same box, and cleanup jobs (e.g. edge functions) under load. Watch Supabase **connection limits**, **Storage** quotas, and **egress**.
5. **Degraded dependencies** — Timeouts, 5xx from Supabase, and partial failures during multipart or signed-URL flows.

### How to run it

- Use a **dedicated staging** project that mirrors production sizing (or scaled-down but **representative** limits), not your laptop against production Supabase.
- Prefer tools such as **[k6](https://k6.io/)**, **[Artillery](https://www.artillery.io/)**, or similar, with **ramp-up** and **sustained** phases; record **latency percentiles**, **error rates**, and **resource** metrics (API CPU/memory, DB connections, Storage errors).
- Validate **rate limiting** (see `backend/README.md`) under attack-like traffic: you want stable rejection behavior, not silent data corruption or unbounded queues.
- Include **soak tests** (hours at moderate load) to catch memory leaks, connection pool exhaustion, or Storage cleanup gaps.

### Exit criteria (example—tune to your SLOs)

Document agreed thresholds, for example: p95 API latency under X ms at Y RPS, error rate below Z%, no unbounded growth of PENDING rows, and no successful bypass of upload/register validation at configured max sizes.

---

## Security and cryptographic audit (why and what)

Encryption in the browser and a small API surface **do not** remove the need for a **formal security review**. Adoption decisions should be backed by **evidence**, not only by reading this repo’s README.

### Scope that an audit should cover

1. **Threat model** — Who are the attackers (network, malicious uploader, compromised owner device, operator)? What assets are you protecting (file confidentiality, integrity, availability, metadata)?
2. **Cryptography** — ML-KEM + AEAD usage in Rust/WASM: parameter choices, KDF/context binding, nonce handling, and whether ciphertexts are **authenticated** end-to-end for your intended guarantees. Review should include the **WASM build** and **distribution** (integrity of the bundle, supply chain).
3. **API and authorization** — Every route: authentication, object ownership, IDOR on `boxId`/`fileId`, validation of sizes and fields (`uploadValidation`-style rules), and **no leakage** of owner-only data on public endpoints.
4. **Supabase configuration** — Row Level Security (if used), Storage policies, signed URL lifetimes, **service role** usage on the server only, and Auth redirect / OAuth settings.
5. **Dependencies** — Automated scanning (`npm audit`, Rust `cargo audit`, GitHub Dependabot-style workflows) plus **manual** review of critical paths.
6. **Operational security** — Secrets handling, logging (no secrets or file contents in logs), backup and disaster recovery, incident response.

### Who should perform it

- **Internal** security review is useful but rarely sufficient for high-impact adoption.
- **External** penetration testing and/or a **cryptography-focused** review (consulting or specialized firm) is appropriate when stakes are high.

### Exit criteria (example)

A written report: identified issues with severity, remediation status, and **residual risk** sign-off by someone accountable—not a generic “passed scan” PDF.

---

## Relationship between stress testing and audit

- **Stress testing** proves **scalability and stability** under load; it can reveal **denial-of-service** behavior and race conditions.
- **Audit** proves (to an agreed level) **correctness and security** of design and implementation.

Neither substitutes for the other. A system can pass load tests but fail an audit (logic bugs, weak crypto binding), or pass an audit but collapse under realistic traffic.

---

## Summary

Adoption of this codebase for anything beyond experimentation should be preceded by:

1. **Documented stress and soak tests** against staging, with metrics and thresholds.
2. **Independent security review** (and, where appropriate, crypto review) with tracked remediation.
3. **Operational readiness** (monitoring, alerts, backups, incident playbooks) aligned with your risk tolerance.

Until those are in place, treat deployments as **experimental** and limit data classification and user exposure accordingly.
