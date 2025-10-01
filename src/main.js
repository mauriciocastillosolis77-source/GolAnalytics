// Importamos la función que guarda datos
import { guardarUsuario } from "./guardarDatos";

// Seleccionamos el formulario por su ID
const formulario = document.getElementById("formulario-usuarios");

// Escuchamos cuando se haga submit en el formulario
formulario.addEventListener("submit", (event) => {
  event.preventDefault(); // Evita que la página se recargue

  // Tomamos los valores que escribió el usuario
  const nombre = event.target.nombre.value;
  const email = event.target.email.value;

  // Llamamos a la función para guardar los datos en Firestore
  guardarUsuario(nombre, email);

  // Limpiamos el formulario
  event.target.reset();
});
