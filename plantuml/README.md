Arquivos PlantUML gerados a partir dos diagramas do documento:

- `casos_uso_assinatura.puml`
- `sequencia_assinatura_primeiro_acesso.puml`
- `classes_dominio_assinatura.puml`
- `arquitetura_logica.puml`
- `arquitetura_fisica_implantacao.puml`

Como usar no GitHub:

1. envie os arquivos `.puml` para o repositório
2. a workflow [render-plantuml.yml](../../.github/workflows/render-plantuml.yml) gera automaticamente arquivos `.svg`
3. os SVGs ficam em `docs/plantuml/exportados/`
4. voce pode visualizar tudo junto em `docs/plantuml/diagramas_renderizados.md`

Observacao importante:

- GitHub nao renderiza `.puml` inline como faz com `mermaid`
- o fluxo correto no GitHub e gerar `SVG` e visualizar o arquivo renderizado

Se quiser exportar manualmente tambem:

- exporte em `PNG` ou `SVG`
- mantenha o mesmo nome-base do arquivo `.puml`
- depois me diga onde voce salvou as imagens para eu substituir os diagramas no LaTeX
