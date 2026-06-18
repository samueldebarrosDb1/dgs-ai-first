# Entregável — Exercício 2.3: Estratégia de skills do projeto

Projeto NovaTech Assistant. Skills são artefatos `.md` que encapsulam *como gerar* um tipo de output; o Copilot/Claude Code as lê (junto do [`AGENTS.md`](../novatech-assistant/AGENTS.md)) antes de gerar código. Hierarquia **Foundation → Domain → Artifact** conforme Anexo C (`/skills/foundation/`, `/skills/domain/`, `/skills/artifact/`).

---

## 1. Árvore de skills (Foundation → Domain → Artifact)

```
skills/
├── foundation/                      # convenções globais — base de tudo
│   ├── typescript-conventions/SKILL.md   ★ implementada (ver §3)
│   ├── error-handling.md            # discriminated unions, classes de erro → HTTP, sem throw no fluxo normal
│   └── project-structure.md         # onde cada artefato mora (Anexo C); imports ESM; nomenclatura de pastas
│
├── domain/                          # padrões por camada
│   ├── azure-functions-endpoint.md  # estrutura de endpoint v4: handler + validator + response-builder, authLevel, logging
│   ├── azure-ai-search-integration.md # como consultar o índice: top-5, score, metadado de vigência (ADR-0003)
│   ├── react-components.md          # padrões de componente do painel web (props tipadas, estados de loading/erro)
│   └── testing-patterns.md          # Vitest: unit vs integration, mocks de HttpRequest/InvocationContext, fixtures
│
└── artifact/                        # receitas de geração ponta-a-ponta
    ├── create-rag-endpoint.md       # gerar um endpoint RAG completo (busca→prompt→modelo→resposta com fonte) respeitando o context budget (ADR-0002)
    ├── create-integration-test.md   # gerar teste de integração de um endpoint a partir do mapa de cobertura (Anexo B)
    └── create-react-card.md         # gerar um card do painel (ex.: card de resposta, card de feedback)
```

Cada skill tem consumidor real no projeto — endpoints RAG (vários ao longo do roadmap), testes de integração (mesmo padrão para todos), cards React do painel. Nenhuma skill teórica.

> Apenas `typescript-conventions/SKILL.md` é materializada neste exercício (a Foundation base). As demais permanecem como stubs descritos acima — esta é a *estratégia*; cada uma é preenchida pelo seu papel quando o módulo correspondente entra em desenvolvimento.

### Categorias de artefato do enunciado → skills

O enunciado lista 5 artefatos repetidos. Mapeamento para a árvore:

| Artefato repetido | Skill |
|---|---|
| Endpoint Azure Functions com padrão RAG | `artifact/create-rag-endpoint` (+ `domain/azure-functions-endpoint`, `domain/azure-ai-search-integration`) |
| Teste de integração para endpoints | `artifact/create-integration-test` (+ `domain/testing-patterns`) |
| Componentes React (cards de resposta/feedback) | `artifact/create-react-card` (+ `domain/react-components`) |
| Documentação técnica (ADRs, README de módulo) | **skill Artifact adicional** `artifact/create-adr` — criada pelo Tech Lead (fora do scaffold inicial do Anexo C) |
| Specs de produto (template SDD) | **skill Artifact adicional** `artifact/create-product-spec` — criada pelo Product Specialist |

As duas últimas não estão no scaffold do Anexo C; entram como skills Artifact à medida que o uso se repete, criadas por papéis não-dev — o que reforça a estratégia multi-papel (§2).

---

## 2. Mapeamento criação / consumo / frequência

Time (cenário 1): 1 Tech Lead, 2 Devs (1 pleno, 1 sênior), 1 QA, 1 Product Specialist, 1 Delivery Manager. **Criação distribuída por papel — não é tudo de dev.**

| Skill | Frase-ativação (o agente reconhece) | Cria | Consome (papel + agente) | Frequência |
|---|---|---|---|---|
| `foundation/typescript-conventions` | "ao gerar/editar qualquer `.ts`" | Tech Lead | Todos + Copilot/Claude Code | Altíssima (toda geração de código) |
| `foundation/error-handling` | "ao tratar erro ou validar entrada" | Tech Lead | Devs, QA + Copilot | Alta |
| `foundation/project-structure` | "ao criar um arquivo novo / decidir onde algo mora" | Tech Lead | Devs, PS, QA + Copilot | Média |
| `domain/azure-functions-endpoint` | "ao criar/alterar um endpoint Azure Functions" | Dev sênior | Devs + Copilot | Alta (vários endpoints) |
| `domain/azure-ai-search-integration` | "ao consultar o índice de busca" | Dev sênior | Devs + Copilot | Média |
| `domain/react-components` | "ao criar componente do painel web" | Dev (front) | Devs + Copilot | Média |
| `domain/testing-patterns` | "ao escrever teste (unit/integration)" | **QA** | Devs, QA + Copilot | Alta |
| `artifact/create-rag-endpoint` | "criar um endpoint RAG completo" | Dev sênior | Devs + Copilot | Média (por módulo) |
| `artifact/create-integration-test` | "gerar teste de integração de um endpoint" | **QA** | Devs, QA + Copilot | Alta |
| `artifact/create-react-card` | "gerar um card do painel" | Dev (front) | Devs + Copilot | Média |
| `artifact/create-product-spec` | "escrever uma spec de produto (SDD)" | **Product Specialist** | PS, Tech Lead + Claude (chat/Cowork) | Média |
| `artifact/create-adr` | "registrar uma decisão arquitetural" | Tech Lead | Tech Lead, Devs + Claude | Baixa |

Papéis criadores distintos: **Tech Lead** (Foundation, ADR), **Dev sênior** (Domain/Artifact de backend), **QA** (testing-patterns, create-integration-test), **Product Specialist** (create-product-spec). Consumo sempre inclui o agente (Copilot/Claude), pois a skill existe para guiar a geração.

---

## 3. SKILL.md da Foundation mais importante — `typescript-conventions`

Escolha: `typescript-conventions` é a base transversal — toda skill Domain e Artifact pressupõe estas regras. Arquivo entregue em [`skills/foundation/typescript-conventions/SKILL.md`](../novatech-assistant/skills/foundation/typescript-conventions/SKILL.md).

> **Nota de nomenclatura.** O enunciado pede "o `SKILL.md`"; o Anexo C mostra a árvore plana (`typescript-conventions.md`). Adotei o padrão Agent Skills — uma **subpasta por skill com um `SKILL.md`** (`foundation/typescript-conventions/SKILL.md`), que permite anexar exemplos/recursos à skill no futuro. O stub plano vazio foi substituído pela subpasta; o slug e o nível Foundation do Anexo C são preservados.

### Geração com Copilot (geração → avaliação → reescrita)

**Prompt ao Copilot:** *"Gere um SKILL.md de convenções de TypeScript para o projeto: regras de tipagem estrita, validação e logging, com exemplos DO/DON'T."*

**1º passe (o que o Copilot entregou):** regras corretas, porém **genéricas e abstratas** — sem código do projeto e sem anti-padrões concretos:

```markdown
# TypeScript Conventions
- Use tipos estritos e evite `any`.
- Valide entradas e trate erros adequadamente.
- Use um logger em vez de console.
- Escreva código limpo e bem documentado.

## DO / DON'T
- DON'T: usar `any`.
- DO: usar tipos específicos.
```

**Avaliação crítica:** isso falha no critério da skill ("texto abstrato sem código" = red flag). Problemas: (i) "evite `any`" sem mostrar a alternativa real (`unknown` + Zod); (ii) "trate erros adequadamente" não é acionável; (iii) DO/DON'T sem código que um agente possa imitar; (iv) nenhum anti-padrão específico do que o Copilot gera errado.

**Reescrita (versão final):** substituí cada regra abstrata por uma **prescritiva e verificável**, ancorei os DO/DON'T no **código real do Ex. 2.2** (`validator.ts`/`handler.ts`), e adicionei a **tabela de anti-padrões** (`as any`, `console.log`, `require` em ESM, `JSON.parse` sem guard, `if (!body.x)`, `@ts-ignore`). O resultado é o arquivo abaixo.

Frontmatter (ativação + governança):

```yaml
name: typescript-conventions
description: >-
  Convenções globais de TypeScript do NovaTech Assistant. Ative ao gerar ou
  editar QUALQUER arquivo .ts do projeto (endpoints, services, types, testes).
  É a skill Foundation base — toda skill Domain e Artifact herda destas regras.
level: foundation
owner: Tech Lead
consumers: [Tech Lead, Desenvolvedor, QA, Product Specialist, GitHub Copilot, Claude Code]
```

Regras prescritivas (resumo — íntegra no arquivo): `strict: true` inegociável; proibido `as any` (entrada externa entra como `unknown` + Zod); validação na borda com `safeParse` retornando discriminated union, sem `throw` no fluxo normal; imports ESM com extensão `.js`, sem `require`; sem `console.log`; JSDoc no que é público; erros via `ValidationError`/`UpstreamError` → HTTP.

DO/DON'T com código real do Ex. 2.2 (exemplo — entrada externa):

```typescript
// ❌ DON'T — desliga o type-checker; aceita "   " e tipos errados; quebra com body null
const body = (await request.json()) as any;
if (!body.question) return { status: 400, body: "question é obrigatório" };

// ✅ DO — unknown estreitado por Zod, parse que não lança (validator.ts)
const result = queryRequestSchema.safeParse(body); // body: unknown
if (!result.success) return { status: 400, jsonBody: { error: ... } };
```

Anti-padrões catalogados (os que o Copilot realmente gera): `as any`, `console.log`, `require()` em projeto ESM, `JSON.parse` sem try/catch (→ 500 indevido), validação manual `if (!body.x)` (aceita string de espaços), `// @ts-ignore`, engolir `catch (e) { throw e }` sem preservar a causa. Cada um com a correção na tabela do arquivo.

---

## 4. Conexão com o AGENTS.md e o cenário 1

**AGENTS.md ↔ skills.** O [`AGENTS.md`](../novatech-assistant/AGENTS.md) é a *constituição* (o que vale no projeto); as skills detalham o **como gerar** cada artefato. A relação é de referência mútua: a seção *Coding Standards* do AGENTS.md aponta para `foundation/typescript-conventions` em vez de duplicar as regras; a skill, por sua vez, cita o AGENTS.md como fonte. Assim o agente lê a constituição e, ao gerar um artefato específico, carrega a skill correspondente — sem inchar o AGENTS.md (respeitando o context budget da ADR-0002).

**Decisões do cenário 1 ancoradas nas skills:**
- **ADR-0001** (stack TS + Azure/Microsoft) → fundamenta `typescript-conventions` e `azure-functions-endpoint`.
- **ADR-0002** (context budget ~4K system + ~8K chunks) → regra explícita em `artifact/create-rag-endpoint`.
- **ADR-0003** (documentos contraditórios por vigência) → regra em `azure-ai-search-integration` e no response-builder gerado.
- **ADR-0004** (protótipo open-source validou a abordagem) → as skills codificam os padrões de **produção** que sucedem o protótipo: o que era exploração agora é geração consistente e governada.
