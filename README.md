# Nexxera · Calculadora de tributos

Aplicação local em português para cadastrar empresas, simular operações e conectar as calculadoras RTC da Receita Federal. Interface responsiva, sem dependências de produção ou etapa de build.

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
- Não há atualização automática do código/banco RTC nem monitoramento de alterações legais. As consultas usam a versão da instância conectada. É necessário manter e validar as versões do motor e da base fiscal.
- O servidor escuta apenas em `127.0.0.1`. Uma implantação multiusuário requer autenticação, banco persistente, segregação por empresa e HTTPS.
- Fontes Google são opcionais: sem internet a interface utiliza fontes do sistema.

## Estrutura

```text
public/index.html    Interface
public/styles.css    Estilos responsivos
public/app.js        Cadastros, operações, histórico e integração
public/domain.mjs    Adaptação dos contratos e aritmética demonstrativa
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
