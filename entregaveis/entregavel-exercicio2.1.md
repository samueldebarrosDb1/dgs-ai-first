# Entregável — Exercício 2.1: Configuração e uso real de MCP servers

Projeto NovaTech Assistant — repositório `novatech-assistant/` (Git local). Todos os servers são *reference servers* gratuitos e locais (via `npx`/`uvx`), sem nenhum serviço pago ou externo.

---

## 1. Mapeamento — necessidade do projeto → MCP server

Cada server expõe **Tools** (ações), **Resources** (dados read-only) e/ou **Prompts** (templates), rodando localmente.

| Necessidade do projeto | Server | O que expõe (Tools / Resources / Prompts) | Quem consome | Escopo / pasta |
|---|---|---|---|---|
| Ler e escrever código, specs e skills | `filesystem` | **Tools:** `read_file`, `read_multiple_files`, `write_file`, `edit_file`, `create_directory`, `list_directory`, `directory_tree`, `move_file`, `search_files`, `get_file_info`. **Resources:** raízes permitidas. | Devs, Tech Lead | `./src`, `./specs`, `./skills` |
| Ler documentação de negócio da NovaTech (substitui Confluence — ADR-0001: stack Azure/Microsoft; nesta fase o repo é local sem remoto) | `filesystem` | Tools de leitura (`read_file`, `list_directory`, `search_files`) | Todos os papéis | `./docs/novatech/` (Anexo A) — leitura |
| "Recuperar" chunks para RAG (substitui Azure AI Search — ADR-0004: protótipo open-source validou a abordagem; corpus local simula o índice de produção) | `filesystem` | Tools de leitura/busca (`search_files`, `read_file`) | Devs, QA, Product Specialist | `./data/retrieval-corpus/` (Anexo B) — leitura |
| Histórico, diff e branches do repositório (substitui GitHub) | `git` | **Tools:** `git_status`, `git_log`, `git_diff`, `git_diff_staged`, `git_show`, `git_branch`. | Tech Lead, Devs, QA | repositório local (`.`) |
| Memória persistente: linguagem ubíqua e decisões do projeto | `memory` | **Tools:** `create_entities`, `create_relations`, `add_observations`, `read_graph`, `search_nodes`, `open_nodes`. **Resources:** grafo de conhecimento. | Todos os papéis | grafo local |
| Explorar/aprender as primitivas de MCP | `everything` | Tools/Resources/Prompts de demonstração. | Time (aprendizado) | — |

---

## 2. `.mcp/mcp.json` final + justificativa de least privilege

Arquivo entregue em [`novatech-assistant/.mcp/mcp.json`](../novatech-assistant/.mcp/mcp.json):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "./src",
        "./specs",
        "./skills",
        "./docs/novatech",
        "./data/retrieval-corpus"
      ]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "."]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "everything": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

Os escopos são caminhos relativos à raiz do repositório (`novatech-assistant/`), diretório de trabalho dos servers.

### Por que cada escopo é o mínimo suficiente

| Server | Escopo | Justificativa do mínimo |
|---|---|---|
| `filesystem` | `./src ./specs ./skills ./docs/novatech ./data/retrieval-corpus` | Aponta só para as 5 pastas necessárias, e **não para a raiz do repo** nem para `./docs`/`./data` inteiros. Ficam **fora do alcance**: `.env` (segredos), `.git/`, `infra/` (Bicep), `.github/`, `node_modules/`, `package.json`. Menor superfície = menos a vazar ou alterar por engano. |
| `git` | `--repository .` | Cobre histórico/diff/branches sem expor `.git/` via filesystem. Uso só de leitura; não há push/remoto. |
| `memory` | grafo local | Não acessa nenhuma pasta do repo — mantém apenas seu próprio grafo. |
| `everything` | — | Server de aprendizado das primitivas de MCP; não aponta para dados do projeto. |

### Read-only para as fontes de negócio (`docs/novatech/`, `data/retrieval-corpus/`)

Essas pastas são fonte de verdade (substituem Confluence e Azure AI Search). Pela **ADR-0003**, documentos contraditórios são gerenciados por metadado de vigência — o corpus não pode ser alterado pelo agente, pois toda mudança exige processo de Compliance. Pela **ADR-0004**, o corpus representa o resultado do pipeline de chunking validado no protótipo; alterações corrompem silenciosamente a qualidade do retrieval. O read-only é garantido por:

1. **Gate de aprovação do agente** — toda escrita (`write_file`/`edit_file`/`move_file`) exige confirmação humana antes de tocar o disco; a política é recusar qualquer escrita nessas pastas.
2. **Instrução no `AGENTS.md`** — registrar que `docs/novatech/` e `data/retrieval-corpus/` são fontes read-only.
3. **Reforço por SO (opcional)** — marcar essas pastas como somente-leitura (atributo/ACL) garante o read-only independente do agente.

---

## 3. Evidência de execução

Servers ativos no Claude Code, a partir da raiz `novatech-assistant/`.

### Servers conectados (`claude mcp list`)

```
filesystem: npx -y @modelcontextprotocol/server-filesystem ./src ./specs ./skills ./docs/novatech ./data/retrieval-corpus - ✔ Connected
git: uvx mcp-server-git --repository . - ✔ Connected
memory: npx -y @modelcontextprotocol/server-memory - ✔ Connected
everything: npx -y @modelcontextprotocol/server-everything - ✔ Connected
```

### (a) Listar e ler um documento de `docs/novatech/` (via `filesystem`)

**Prompt:** "Usando o filesystem MCP server, liste os arquivos da pasta `docs/novatech` e leia `POL-001-politica-devolucao.md`."

`list_directory` → `docs/novatech`:

```
[FILE] FAQ-atendimento.md
[FILE] POL-001-politica-devolucao.md
[FILE] PROC-042-frete-especial-v1.md
[FILE] PROC-042-v2-frete-especial-revisado.md
[FILE] README.md
[FILE] SLA-2024-tabela-sla-clientes.md
```

`read_text_file` → `POL-001-politica-devolucao.md` (trechos):

```
POL-001 — Política de Devolução de Mercadorias
Versão: 3.1 · Última atualização: 15/01/2024 · Responsável: Diretoria de Operações

3.1. Prazo geral — Até 7 dias úteis após a data de recebimento confirmada no tracking.
3.2. Exceções ao prazo — NÃO elegíveis pelo processo padrão:
  - Cargas perigosas classes 1 a 6 da ANTT (Resolução nº 5.947/2021).
  - → Esses casos vão para Gestão de Riscos (ramal 4500).
3.5. Custos — Defeito/erro NovaTech: sem custo. Desistência do cliente: frete reverso por
     conta do cliente. Prazo expirado: encaminhar ao Comercial.
```

### (b) Recuperar um chunk relevante de `data/retrieval-corpus/` (via `filesystem`)

Gabarito: Anexo B — Mapa de cobertura.

**Pergunta:** *"Frete para 600kg para Manaus?"* (Manaus = Norte; 600 kg → fator de peso 1.0).

Chunks recuperados:

```
PROC-042v2-A — Seção 2: Fórmula atualizada
> Frete especial para cargas acima de 500kg (versão revisada, novembro/2023).
> Fator de peso: 1.0 (500-1.000kg), 1.15 (1.001-3.000kg), 1.4 (acima de 3.000kg).

PROC-042v2-B — Seção 2.1: Multiplicadores regionais atualizados
> Sul 1.3, Sudeste 1.1, Centro-Oeste 1.4, Nordeste 1.5, Norte 1.8.

PROC-042-B (versão antiga, relevância menor — risco de contradição)
> Sul 1.2, Sudeste 1.0, Centro-Oeste 1.3, Nordeste 1.4, Norte 1.6.
```

Resultado conforme gabarito: devem ser recuperados `PROC-042v2-A` e `PROC-042v2-B`; `PROC-042-B` aparece como possível contradição (Norte 1.6 vs 1.8). A resposta correta usa a versão revisada (v2) — alinhado à **ADR-0003**: quando ambas as versões são recuperadas, o modelo deve priorizar a mais recente (metadado de vigência; nov/2023).

### (c) Ler o histórico do repositório (via `git`)

**Prompt:** "Usando o git MCP server, mostre o `git_log` e o `git_status`."

```
git_log
Commit: bbdd03aeecd7e349a2bfc93849e0552a0b766ac6
Author: Trilha AI First <trilha@db1.local>
Date:   2026-06-09 18:13:30 +00:00
Message: chore: starter repo (Anexo D) — estrutura + dados semeados dos Anexos A e B

git_status
On branch master
Changes not staged for commit:
  modified: .mcp/mcp.json
Untracked files:
  .mcp.json
```

---

## 4. Análise de riscos de segurança (setup local) + mitigações

### Risco 1 — Escopo amplo do `filesystem` expõe segredos (`.env`) e IaC

**Descrição:** se o `filesystem` apontasse para a raiz do repo (ou `./docs`/`./data` inteiros), o agente leria `.env` (chaves de API), `infra/` (parâmetros Bicep) e `.git/`. Um prompt injection num documento lido, ou um erro, poderia levar o agente a vazar segredos na resposta ou em logs.

**Mitigação:**
- Escopo restrito às 5 pastas necessárias — `.env`, `.git/`, `infra/`, `.github/` ficam fora do alcance.
- Manter `.env` no `.gitignore` e nunca adicioná-lo a uma pasta escopada.
- Usar o server `git` dedicado (leitura) em vez de expor `.git/` pelo filesystem.

### Risco 2 — Escrita habilitada permite o agente alterar arquivos sem revisão

**Descrição:** o `filesystem` expõe `write_file`/`edit_file`/`move_file` com escrita habilitada em todas as pastas escopadas. Sem controle, o agente poderia sobrescrever um documento de negócio em `docs/novatech/` ou alterar um chunk em `data/retrieval-corpus/`, corrompendo o gabarito do RAG, sem aprovação humana.

**Mitigação:**
- Manter ligado o gate de aprovação de escrita do agente e recusar qualquer escrita em `docs/novatech/` e `data/retrieval-corpus/`.
- Concentrar a escrita do agente em `./src ./specs ./skills`, com revisão de diff e code review antes do commit.
- Marcar `docs/novatech/` e `data/retrieval-corpus/` como somente-leitura no SO (atributo/ACL) como garantia independente do agente.

### Risco 3 — Prompt injection via conteúdo lido / dependências `npx`/`uvx` não fixadas

**Descrição:** (i) documentos lidos podem conter instruções maliciosas interpretadas como comando; (ii) `npx -y`/`uvx` baixam o pacote a cada execução — uma versão comprometida do server rodaria com as permissões concedidas.

**Mitigação:**
- Tratar conteúdo de `docs/`/`data/` como dado não confiável, não como instrução; manter o gate humano.
- Fixar versões dos servers (pinning, ex. `@modelcontextprotocol/server-filesystem@<versão>`) e revisar o `mcp.json` em code review.
