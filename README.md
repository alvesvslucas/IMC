# Calculadora de IMC

Exercício web que recebe peso em quilogramas e altura em metros para calcular o índice de massa corporal no navegador.

## Tecnologias e recursos

- HTML, CSS e JavaScript.
- Cálculo pela fórmula `peso / (altura × altura)`.
- Resultado numérico com duas casas decimais.
- Mensagem para entradas não numéricas ou altura menor ou igual a zero.
- Imagem de referência para o IMC.

## Como visualizar

```bash
git clone https://github.com/alvesvslucas/IMC.git
cd IMC
```

Abra `index.html` em um navegador. Preencha peso e altura e clique em **Calcular**.

## Estrutura

- `index.html`: formulário e área de resultado.
- `app.js`: leitura dos campos, cálculo e mensagem.
- `style.css`: estilos.
- `arquivos/`: imagem de referência.

## Escopo

O projeto exibe o valor numérico do IMC; não realiza classificação automática do resultado. A validação atual ainda permite peso zero ou negativo.

