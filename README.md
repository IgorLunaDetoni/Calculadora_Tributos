# Nexxera · Calculadora de tributos

Aplicação local em português para acompanhar as fontes da reforma tributária, cadastrar empresas, simular operações e conectar as calculadoras RTC da Receita Federal. Interface responsiva, sem dependências de produção ou etapa de build.

## Prioridade atual: regras e atualizações

A página inicial **Regras e atualizações** reúne o catálogo inicial de referências, a saúde dos coletores, versões disponíveis no GitHub, evidências e mudanças pendentes de análise. O objetivo seguinte é cruzar as regras aplicáveis com os dados Nexxera e conciliar o saldo devido com pagamentos comprovados.

- `config/sources.json`: fontes permitidas, tipo de conector e limites da cobertura.
- `config/rules.json`: referências documentadas, fontes, condições, parâmetros e períodos. **Todas são informativas (`executable: false`)**; o catálogo não decide o saldo a recolher nem substitui o motor RTC.
- `.local/monitor/`: estado persistente do monitor, snapshots identificados por SHA-256, histórico de alterações, catálogos e contextos dos cálculos. Esta pasta é ignorada pelo Git; faça backup dela para preservar a auditoria.

O conjunto inicial contém referências sobre CBS/IBS de 2026, dispensa condicionada ao cumprimento das obrigações acessórias, IBS e CBS em 2027–2028, Simples e split payment. É um recorte inicial, **não um levantamento exaustivo de todas as regras, exceções, atos ou notas técnicas**.

### O que atualiza automaticamente

Ao iniciar o servidor, e a cada **4 horas** enquanto ele estiver ativo, o coletor:

1. Consulta o commit da branch `main` de cada projeto RTC e lê o changelog **nesse mesmo commit**. Versão do changelog não prova a existência de release implantável nem corresponde necessariamente à instância instalada.
2. Coleta as páginas oficiais configuradas, normaliza o conteúdo e compara texto e links com a última cópia válida. PDF textual exige Poppler (`pdftotext` no PATH ou `PDFTOTEXT_PATH`); no Windows, detecta também a instalação padrão do Calibre. A extração de texto não comprova fidelidade de tabelas ou layout; o original permanece disponível. Não há OCR.
3. Descobre páginas de atos vinculadas aos dois índices RFB/CGIBS e acompanha essas páginas em um nível, com limite de **50 documentos descobertos**. Quando o próprio link redireciona para PDF textual, arquiva o original e extrai seu texto. Não percorre anexos ou links em profundidade. Páginas descobertas também aparecem no painel.
4. Salva as evidências e registra alterações ou novos atos para análise. Erros, barreiras de acesso e conteúdo vazio preservam a última referência válida e aparecem como falha.

A primeira coleta de uma fonte configurada cria sua linha de base. Um ato descoberto gera um registro de análise inicial. A troca do normalizador pode produzir eventos de ajuste do coletor, identificados separadamente de mudanças de conteúdo. A data de detecção não é a publicação nem a produção de efeitos da norma. A consulta interativa **Sistema Normas da Receita** está identificada como manual: não há conector de pesquisa homologado para ela.

Também é possível disparar uma coleta sem manter a interface aberta:

```powershell
.\iniciar.cmd --sync
# Com Node instalado:
npm run sync:rules
```

O comando retorna código 2 quando alguma fonte automática falha. Ele pode ser chamado por um agendador da infraestrutura. **Nenhuma tarefa do Windows ou automação externa é criada pelo projeto.** Para coleta contínua com o aplicativo fechado, um serviço ou agendador deve executar esse comando.

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `MONITOR_ENABLED` | `true` | `false` desativa somente o ciclo automático do servidor. |
| `MONITOR_INTERVAL_HOURS` | `4` | Intervalo mínimo de 1 hora. |
| `PDFTOTEXT_PATH` | Detecção local | Caminho do executável Poppler para PDFs textuais. |

### Detecção, interpretação e aplicação

A ingestão de conteúdo é automática. **Interpretar um ato e transformá-lo em fórmula executável ainda exige implementação e validação fiscal.** Marcar uma alteração como analisada registra responsável, data e encaminhamento; não publica regra, não homologa vigência e não atualiza o JAR/banco RTC.

Uma implantação posterior deve testar versões candidatas do motor e da base, confirmar a vigência, publicar uma versão aprovada e permitir rollback. Não há download e execução automática de código remoto nesta versão. Alterar `config/rules.json` atualiza a referência exibida, mas não modifica as fórmulas do motor oficial.

Cada cálculo encaminhado à RTC arquiva um contexto com a versão do catálogo, hashes das fontes observadas, pendências e a resposta de `/versao` da instância instalada, quando disponível. A identidade é consultada **antes** do cálculo; não se assume que seja atomicamente vinculada à execução. Os headers de versão/aviso retornados pelo cálculo são guardados em um recibo separado. A memória exportada contém esse contexto. O catálogo informativo não é apresentado como regra aplicada pelo motor.

O fluxo de evolução e os dados para a futura conciliação estão em [docs/evolucao-tributaria.md](docs/evolucao-tributaria.md).

## Executar

Requer **Node.js 22 ou superior**.

```powershell
npm start
```

Abra **http://127.0.0.1:3000**. Não é necessário executar `npm install`.

No Windows, também é possível iniciar pelo terminal (ou abrir `iniciar.cmd`):

```powershell
.\iniciar.cmd
```

O iniciador prefere uma instalação normal de Node. Se ela não existir, pode usar o runtime Node 22+ incluído no VS Code instalado, somente para desenvolvimento local, sem abrir o editor. Para testes, use `.\iniciar.cmd --test`. Para outra porta, configure a variável `PORT` antes de iniciar. Encerre com `Ctrl+C`.

```powershell
npm test
```

Para desenvolvimento com reinício do servidor: `npm run dev`.

## Funcionalidades

- Cadastro, edição, seleção e exclusão de empresas, com validação de CNPJ numérico ou alfanumérico e prevenção de duplicatas.
- Município por nome, filtrado pela UF, com preenchimento automático do código IBGE na operação e no cadastro. A lista oficial fica no projeto e funciona sem consulta externa durante o preenchimento; nomes completos também são reconhecidos sem acento. Para atualizar a lista, execute `npm run sync:municipalities` (requer internet).
- Persistência de empresas e operações no `localStorage` do navegador, com backup JSON e importação que preserva registros existentes.
- Operações com múltiplos itens, data, destino, NCM/NBS, CST e cClassTrib.
- Formulário próprio para Simples Nacional (CRT 1), atividade e alíquotas efetivas.
- Demonstração linear explicitamente identificada, com arredondamento por item em centavos.
- Conexão às duas APIs RTC, consultas oficiais de classificação/atividade, conferência dos estados de cada item e exportação da entrada e resposta completas.
- Projeção do split payment sobre o total pago informado, segregando CBS + IBS e mantendo IS fora da segregação.
- Histórico pesquisável e memória de cálculo em JSON.

## Conectar os motores oficiais

Os repositórios são implementações das APIs, não endereços públicos de cálculo. Instale e execute os serviços conforme os READMEs oficiais:

- [Regime regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)
- [Simples Nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional)

Os READMEs consultados em 23/11/2026 indicam Java 25 e geração prévia do banco via Flyway. O projeto do Simples utiliza os scripts de banco do regime regular. Consulte os requisitos da versão efetivamente instalada.

O servidor deste projeto usa estes padrões:

| Variável | Padrão |
| --- | --- |
| `PORT` | `3000` |
| `RTC_REGULAR_URL` | `http://127.0.0.1:8080/api` |
| `RTC_SIMPLES_URL` | `http://127.0.0.1:8082/api` |

Para alterar, configure antes de iniciar:

```powershell
$env:RTC_REGULAR_URL = 'http://127.0.0.1:8080/api'
$env:RTC_SIMPLES_URL = 'http://127.0.0.1:8082/api'
npm start
```

Na interface, abra **Integrações**, verifique a conexão e selecione **API RTC** na calculadora. A verificação consulta `/versao`; ela não garante que toda operação seja suportada. Não há fallback para demonstração quando a API falha. As rotas de proxy são limitadas e os endereços são configurados no servidor.

### Contratos usados

- Regular: `POST /api/calculadora/observabilidade/regime-geral`.
- Simples: `POST /api/calculadora/observabilidade/simples-nacional` (contrato clássico por item, versão 2.0.0; mantido no upstream, mas marcado como obsoleto em favor do fluxo não assistido).
- Consulta regular: classificação tributária por código e data.
- Consulta Simples: atividades por classificação, documento e data.

No regular, a entrada omite `aliquotasNominais` antes de 2027. A partir de 2027, envia as alíquotas preenchidas e identifica o cálculo como simulado quando a RTC assim o retorna. As taxas ilustrativas do modo demonstração não são usadas como referência legal.

O formulário recebe **bases já apuradas**. Não deriva a base fiscal a partir de preço bruto, frete, tributos legados ou descontos. No regular com IS, contempla o caso simplificado ad valorem, por item, com base de IS informada; o motor deriva CBS/IBS. No Simples, o valor de IS é informado já calculado. Casos específicos, alíquotas específicas por unidade, compras governamentais, créditos, diferimentos, suspensões e outros enquadramentos exigem expansão do formulário.

O horário de fato gerador do contrato regular usa 12h no deslocamento UTC−03 para a data escolhida. A interface coleta a data, não o horário exato de emissão. Se a operação exigir horário e fuso específicos, amplie esse campo antes do uso operacional.

## Limites desta versão

- Os dados ficam **somente no navegador**, sem autenticação, sincronização entre dispositivos ou banco de empresas no servidor. A limpeza dos dados do navegador apaga os cadastros; exporte backups.
- Não há consulta cadastral automática do CNPJ; a validação é sintática e dos dígitos verificadores.
- A demonstração não executa legislação nem apura DAS. O escopo do formulário Simples é CRT 1, com NF-e/NFC-e no fluxo oficial; MEI, excesso de sublimite e regimes híbridos não são contemplados.
- O split é uma **projeção**, sem integração com PSP ou com a Plataforma Pública do Split Payment. Não considera créditos, compensações ou débitos já extintos, não retém valores e não recolhe tributos. Aplicabilidade no Simples depende do enquadramento.
- O monitor detecta alterações nas fontes cobertas, mas não converte texto normativo em fórmulas nem atualiza automaticamente o código/banco RTC. As consultas de cálculo usam a versão da instância conectada. É necessário manter e validar as versões do motor e da base fiscal.
- O servidor escuta apenas em `127.0.0.1`. Uma implantação multiusuário requer autenticação, banco persistente, segregação por empresa e HTTPS.
- Fontes Google são opcionais: sem internet a interface utiliza fontes do sistema.

## Estrutura

```text
public/index.html    Interface
public/styles.css    Estilos responsivos
public/app.js        Cadastros, operações, histórico e integração
public/domain.mjs    Adaptação dos contratos e aritmética demonstrativa
public/monitor.js    Painel de fontes, referências, evidências e análise
lib/governance.mjs   Coleta, descoberta de atos, histórico e rastreabilidade
config/             Fontes e catálogo inicial de referências
scripts/            Coleta independente para agendadores da infraestrutura
server.mjs           Servidor HTTP e proxy RTC com rotas limitadas
tests/               Verificações de cálculos, contratos e proxy
```

## Fontes

Consultadas em 23/11/2026:

- [Documentação e exemplos do regime regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/blob/main/docs/exemplos.md).
- [Contrato de entrada Simples](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/main/src/main/java/br/gov/serpro/rtc/api/simplesnacional/model/input/OperacaoSimplesInput.java).
- [Contrato dos itens Simples](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional/blob/main/src/main/java/br/gov/serpro/rtc/api/simplesnacional/model/input/ItemSimplesInput.java).
- [Documentação da Plataforma Pública do Split Payment](https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/junho/receita-federal-e-comite-gestor-do-ibs-publicam-documentacao-tecnica-da-plataforma-publica-do-split-payment).
- [LC 214/2025 atualizada](https://www2.camara.leg.br/legin/fed/leicom/2025/leicomplementar-214-16-janeiro-2025-796905-normaatualizada-pl.html).
