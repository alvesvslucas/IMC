document.getElementById("button").addEventListener("click", function () {
  const peso = parseFloat(document.getElementById("peso").value);
  const altura = parseFloat(document.getElementById("altura").value);
  if (!isNaN(peso) && !isNaN(altura) && altura > 0) {
    const imc = peso / (altura * altura);
    document.getElementById("resultado").textContent = `Seu IMC é ${imc.toFixed(
      2
    )}`;
  } else {
    document.getElementById("resultado").textContent =
      "Por favor, insira valores válidos para peso e altura.";
  }
});
