# GolAnalytics

GolAnalytics es una aplicación web para entrenadores de fútbol que permite analizar métricas de equipos, etiquetar jugadas en videos y obtener sugerencias de análisis impulsadas por IA. Está construida con React, Vite, Supabase y la API de Gemini.

## Pasos para la Puesta en Marcha

Para llevar esta aplicación a producción y hacerla accesible desde cualquier lugar, sigue estos pasos.

### Prerrequisitos

- **Cuenta de Supabase:** [Crea una cuenta gratuita en Supabase](https://supabase.com/).
- **Cuenta de Vercel:** [Crea una cuenta gratuita en Vercel](https://vercel.com/). Puedes registrarte con tu cuenta de GitHub, GitLab o Bitbucket.
- **Clave de API de Gemini:** [Obtén una clave de API de Google AI Studio](https://aistudio.google.com/app/apikey).
- **Git:** Debes tener Git instalado para clonar el proyecto y subirlo a tu propio repositorio (ej. GitHub).

---

### Paso 1: Configuración de la Base de Datos en Supabase

1.  **Crear un Nuevo Proyecto:**
    - Inicia sesión en tu cuenta de Supabase y crea un nuevo proyecto.
    - Guarda bien la **URL del Proyecto** y la **Clave `anon` pública**. Las necesitarás más adelante.

2.  **Crear las Tablas:**
    - Dentro de tu proyecto de Supabase, ve a `SQL Editor` y ejecuta los siguientes comandos para crear toda la estructura necesaria.

    ```sql
    -- Tabla para perfiles de usuario, vinculada a la autenticación (ESTRUCTURA MEJORADA)
    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      rol TEXT CHECK (rol IN ('admin', 'auxiliar')) DEFAULT 'auxiliar',
      full_name TEXT,
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Tabla para los partidos
    CREATE TABLE public.matches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fecha DATE NOT NULL,
      rival TEXT NOT NULL,
      torneo TEXT NOT NULL,
      categoria TEXT,
      jornada INT4,
      nombre_equipo TEXT NOT NULL,
      coach_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
      is_finalized BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Tabla para los jugadores
    CREATE TABLE public.players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre TEXT NOT NULL,
      numero INT4,
      posicion TEXT,
      categoria TEXT,
      coach_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Tabla para las etiquetas de las jugadas (ESTRUCTURA CORREGIDA Y FINAL)
    CREATE TABLE public.tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
      player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
      timestamp NUMERIC NOT NULL,
      accion TEXT NOT NULL,
      resultado TEXT, -- Puede ser 'logrado', 'fallado', o nulo para acciones sin resultado
      coach_uid UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ```

3.  **Configurar Políticas de Seguridad (RLS - Row Level Security):**
    - Esto es **CRUCIAL** para la seguridad. Ve a `SQL Editor` y ejecuta el siguiente script completo. Borrará cualquier regla anterior para asegurar una configuración limpia y definitiva.

    ```sql
    -- INICIO DEL SCRIPT DE SEGURIDAD DEFINITIVO --

    -- PASO 1: Borrar políticas antiguas para evitar conflictos
    DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
    DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
    DROP POLICY IF EXISTS "Admins can do everything on matches." ON public.matches;
    DROP POLICY IF EXISTS "Authenticated users can view matches." ON public.matches;
    DROP POLICY IF EXISTS "Admins can do everything on players." ON public.players;
    DROP POLICY IF EXISTS "Authenticated users can view players." ON public.players;
    DROP POLICY IF EXISTS "Admins can do everything on tags." ON public.tags;
    DROP POLICY IF EXISTS "Authenticated users can view tags." ON public.tags;
    DROP FUNCTION IF EXISTS get_user_role() CASCADE; -- Usar CASCADE para eliminar dependencias

    -- PASO 2: Crear función auxiliar que SÍ lee nuestra columna 'rol'
    CREATE OR REPLACE FUNCTION get_user_role()
    RETURNS TEXT AS $$
    DECLARE
      user_rol TEXT;
    BEGIN
      -- Esta es la corrección clave: lee la columna 'rol' de la tabla 'profiles'
      SELECT rol INTO user_rol FROM public.profiles WHERE id = auth.uid();
      RETURN user_rol;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;


    -- PASO 3: Definir políticas para la tabla 'profiles'
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view their own profile." ON public.profiles FOR SELECT USING (auth.uid() = id);
    CREATE POLICY "Users can update their own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);


    -- PASO 4: Definir políticas para la tabla 'matches'
    ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
    -- EXPLICACIÓN: `auth.role() = 'authenticated'` es una función de Supabase.
    -- Significa "cualquier usuario que haya iniciado sesión puede ver". ES CORRECTO USAR 'role' AQUÍ.
    CREATE POLICY "Authenticated users can view matches." ON public.matches FOR SELECT USING (auth.role() = 'authenticated');
    -- Para escribir, usamos nuestra función `get_user_role()` que revisa la columna 'rol'.
    CREATE POLICY "Admins can do everything on matches." ON public.matches FOR ALL USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');


    -- PASO 5: Definir políticas para la tabla 'players'
    ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Authenticated users can view players." ON public.players FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "Admins can do everything on players." ON public.players FOR ALL USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');


    -- PASO 6: Definir políticas para la tabla 'tags'
    ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Authenticated users can view tags." ON public.tags FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "Admins can do everything on tags." ON public.tags FOR ALL USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');
    
    -- FIN DEL SCRIPT --
    ```

---

### Paso 2: Configurar tu Entorno Localmente

1.  **Clona el Proyecto:**
    - Descarga el código de la aplicación y guárdalo en una carpeta en tu computadora.

2.  **Crea tu Repositorio Git:**
    - Crea un nuevo repositorio en GitHub (o el servicio que prefieras).
    - Sigue las instrucciones para subir el código que descargaste a tu nuevo repositorio.

3.  **Variables de Entorno:**
    - En la carpeta del proyecto, crea un archivo llamado `.env.local`.
    - Añade tus claves de Supabase y Gemini. El archivo debe verse así:

    ```
    VITE_SUPABASE_URL=TU_URL_DE_SUPABASE
    VITE_SUPABASE_KEY=TU_CLAVE_ANON_PUBLICA_DE_SUPABASE
    VITE_API_KEY=TU_API_KEY_DE_GEMINI
    ```
    > **Importante:** Asegúrate de reemplazar los valores de ejemplo con tus claves reales. El `VITE_` al inicio es necesario para que Vite las reconozca.

### Paso 3: Despliegue en Vercel

1.  **Importar Proyecto:**
    - Inicia sesión en Vercel.
    - Haz clic en `Add New...` -> `Project`.
    - Importa el repositorio de Git que creaste en el paso anterior.

2.  **Configurar el Proyecto:**
    - Vercel detectará que es un proyecto de Vite y debería configurar los `Build & Development Settings` automáticamente.
    - **Lo más importante:** Ve a la sección `Environment Variables`.
    - Añade las mismas tres variables de entorno que pusiste en tu archivo `.env.local`:
        - `VITE_SUPABASE_URL`
        - `VITE_SUPABASE_KEY`
        - `VITE_API_KEY`

3.  **Desplegar:**
    - Haz clic en el botón `Deploy`.
    - Vercel construirá tu aplicación y la desplegará en una URL pública (ej: `tunombre-golanalytics.vercel.app`).

### Paso 4: Crear tu Primer Usuario

1.  **Visita tu Aplicación:**
    - Abre la URL que Vercel te proporcionó. Verás la pantalla de inicio de sesión.
    - **No podrás iniciar sesión aún**, porque no hay usuarios.

2.  **Crea un usuario Admin:**
    - Ve a tu proyecto en Supabase -> `Authentication` -> `Users`.
    - Haz clic en `Create user` y crea tu primer usuario con tu correo y una contraseña.
    - Después de crearlo, ve a la tabla `profiles` (`Table Editor` -> `profiles`). Verás una fila para tu nuevo usuario, pero el campo `rol` estará como 'auxiliar'.
    - **Edita esa fila y escribe `admin` en la columna `rol`.**

¡Y listo! Ahora puedes ir a la URL de tu aplicación, iniciar sesión con el usuario que creaste y tendrás acceso completo como administrador para cargar la base de datos de jugadores y gestionar toda la información.