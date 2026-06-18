# AGENTS.md — NovaTech Assistant

> Constitution do projeto. Todo agente de IA (Copilot, Claude Code) lê este arquivo antes de gerar qualquer artefato.
> As seções abaixo são preenchidas por papéis diferentes nos exercícios do Cenário 2.

## Project Overview
<!-- TODO (Tech Lead — Ex. 2.1) -->

## Tech Stack & Architecture
<!-- TODO (Tech Lead — Ex. 2.1): inclui regras de gerenciamento de contexto da ADR-0002 -->

## Coding Standards (Tech Lead)

As convenções de código vivem como **skills** (hierarquia Foundation → Domain → Artifact em [`skills/`](skills/)), carregadas pelo agente ao gerar cada tipo de artefato. Esta seção referencia, não duplica — mantém o AGENTS.md enxuto (context budget, ADR-0002).

Regra base, obrigatória em todo `.ts`: [`skills/foundation/typescript-conventions/SKILL.md`](skills/foundation/typescript-conventions/SKILL.md). Em resumo: `strict: true` inegociável; proibido `as any` (entrada externa entra como `unknown` + Zod `safeParse`); validação na borda retornando discriminated union, sem `throw` no fluxo normal; imports ESM com extensão `.js` (sem `require`); sem `console.log` (logger estruturado); erros via `ValidationError`/`UpstreamError` → HTTP. Os anti-padrões a recusar em review estão catalogados na própria skill.

Skills relacionadas: `skills/foundation/error-handling`, `skills/domain/azure-functions-endpoint`, `skills/domain/testing-patterns`.

## Product Rules & Guardrails (Product Specialist)
<!-- TODO (Product Specialist — Ex. 2.3) -->

## Testing Standards (QA)
<!-- TODO (QA — Ex. 2.1) -->

## Project Management Rules (Delivery Manager)
<!-- TODO (Delivery Manager — Ex. 2.3) -->

## Build & Deploy
<!-- TODO (Tech Lead — Ex. 2.1) -->
