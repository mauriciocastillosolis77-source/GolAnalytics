// importar la conexión a Firestore
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";

/**
 * Función para guardar un usuario en Firestore
 * @param {string} nombre - Nombre del usuario
 * @param {string} email - Correo del usuario
 */
export async function guardarUsuario(nombre, email) {
  try {
    // indicamos la colección "usuarios" donde se guardará el documento
    const docRef = await addDoc(collection(db, "usuarios"), {
      nombre: nombre,
      email: email,
      fecha: new Date() // guardamos la fecha de creación
    });

    console.log("Usuario guardado con ID:", docRef.id);
    alert("¡Usuario guardado correctamente!");
  } catch (error) {
    console.error("Error al guardar usuario:", error);
    alert("Error al guardar usuario, revisa la consola.");
  }
}
