# Escopo do acompanhamento tributário Nexxera

## Objetivo

Determinar o tratamento tributário aplicável às operações das empresas da Nexxera e conciliar a obrigação apurada com os valores efetivamente recolhidos ou extintos. O início do trabalho é a manutenção de fontes e referências, com histórico e limites de cobertura explícitos.

## Etapa implementada

O projeto acompanha os repositórios RTC, legislação consolidada e páginas oficiais configuradas. Os índices de atos RFB/CGIBS geram descoberta de páginas de atos em um nível. Conteúdo e versões são arquivados, mudanças são comparadas e a análise pode ser registrada pelo painel. As cópias e contextos persistem no servidor local, em `.local/monitor/`.

O catálogo de referências informa período, regime, condições, parâmetros e fonte. Ele **não é um motor de regras executáveis**. A calculadora continua encaminhando operações à instância RTC configurada, com validação do resultado por item e identificação de simulações.

O escopo inicial não cobre automaticamente todo o Sistema Normas, DOU, resoluções do CGIBS/CGSN, normas estaduais/municipais, documentos fiscais, notas técnicas ou anexos. Os PDFs textuais alcançados por redirecionamento direto dos atos são arquivados e extraídos com Poppler, sem OCR nem interpretação automática da estrutura. Cada fonte deve ter cobertura e conector definidos; indisponibilidade deve ser exibida sem presumir atualização.

## Fluxo para publicar regras e versões aplicáveis

1. **Obter evidência:** identificar fonte, instante da coleta, conteúdo e hash. Para RTC, guardar commit e versão de base/aplicação separadamente.
2. **Classificar a mudança:** conteúdo editorial, correção técnica, regra nova, alteração, revogação ou mudança de vigência. Publicação, detecção, entrada em vigor e produção de efeitos são datas distintas.
3. **Determinar aplicabilidade:** regime, opção do contribuinte, local, data do fato gerador, atividade, produto/serviço, classificação tributária e hipóteses especiais.
4. **Implementar ou atualizar o motor:** preferir o contrato e a base RTC onde houver suporte; manter regras complementares versionadas com fundamento e responsável.
5. **Validar:** cenários de regressão, casos de fronteira e comparação entre a versão vigente e a candidata. Registrar mudanças esperadas e limitações.
6. **Publicar:** vincular código/base à vigência, preservar a versão anterior e permitir rollback. Não recalcular silenciosamente resultados históricos.
7. **Reprocessar quando necessário:** gerar nova versão da apuração, relacionando-a à anterior e à causa da alteração.

Apenas a ingestão e a detecção desse fluxo estão automatizadas nesta versão. Interpretação, homologação e publicação de regras executáveis são próximos componentes de desenvolvimento; o botão de análise não executa essas etapas.

## Dados necessários para cruzar as empresas

| Grupo | Dados esperados |
| --- | --- |
| Cadastro histórico | CNPJ/estabelecimento, regime e opções por período, atividade, localização e eventuais regimes especiais. |
| Operações | Chave do documento, número do item, eventos/cancelamentos, data e fuso, natureza, origem/destino e contraparte. |
| Enquadramento | NCM/NBS, CST, cClassTrib, atividade do Simples e benefícios aplicáveis com fundamento. |
| Valores | Bases e componentes, alíquotas, valores calculados/destacados, reduções, suspensões e diferimentos. |
| Apuração | Período, débitos, créditos, ajustes, dispensa, compensações e extinções, com memória e versão. |
| Pagamentos | Documento de arrecadação, PSP/split, identificador único, tributo, competência, vencimento, liquidação, valor e situação. |
| Auditoria | Fontes e versões usadas, documentos de entrada, resultado, instante da execução e eventual revisão. |

Dados de faturamento e CNAE isoladamente não determinam o imposto devido. Também é necessário tratar operações sem suporte, dados ausentes e hipóteses condicionais como pendências, em vez de preencher valores presumidos.

## Conciliação futura

Os registros precisam distinguir:

- **Destaque na operação:** valor informativo ou calculado no documento.
- **Débito e saldo devido:** obrigação resultante da apuração, com seus ajustes, créditos e condições.
- **Dispensa ou suspensão:** situação legal que altera a exigibilidade/recolhimento, vinculada a evidência.
- **Pagamento ou outra extinção:** evento confirmado, com identificador e vínculo ao débito/período.
- **Diferença:** valor conciliado somente após definir escopo e confirmar as evidências.

Um mesmo débito pode ser extinto por mais de uma modalidade; um pagamento pode liquidar vários débitos. O modelo deverá suportar vínculos muitos-para-muitos, pagamentos parciais, estornos e impedir a contagem duplicada de split e guia de arrecadação. A comparação não deve confundir o período do fato gerador com a data do pagamento.

Antes de usar dados reais multiempresa, será necessário adicionar autenticação, controle de acesso por empresa, banco transacional, integração com as fontes Nexxera e política de retenção/backup. O protótipo atual é local e não acessa dados corporativos da Nexxera.
