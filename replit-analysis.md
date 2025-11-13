# 📊 ANÁLISIS INTEGRAL - GolAnalytics (Rama `test`)

**Fecha**: 2025-11-04  
**Analista**: Senior Full-Stack Developer  
**Branch**: `test`  
**Estado**: ✅ Entorno funcional en Replit (puerto 5000)

---

## 1️⃣ ARQUITECTURA DEL REPOSITORIO (Resumen Ejecutivo)

```
┌─────────────┬──────────────────────────────────────────────────────┐
│ FRONTEND    │ React 19 + TypeScript + Vite + Tailwind CSS (CDN)   │
│             │ Recharts (visualización), React Router (navegación)  │
├─────────────┼──────────────────────────────────────────────────────┤
│ BACKEND     │ Supabase (PostgreSQL + Auth + RLS)                  │
│             │ Vercel Serverless: /api/admin/* (user mgmt)          │
│             │                   /api/predict.py (IA mock)           │
├─────────────┼──────────────────────────────────────────────────────┤
│ BASE DATOS  │ Supabase PostgreSQL: profiles, matches, players,     │
│             │ tags, videos. RLS activo (autenticación + roles)     │
├─────────────┼──────────────────────────────────────────────────────┤
│ EXTERNOS    │ Google Gemini API (análisis IA frames video)         │
│             │ SheetJS/XLSX (export Excel), Supabase Auth           │
├─────────────┼──────────────────────────────────────────────────────┤
│ VIDEO       │ HTML5 <video> + <canvas> para extracción frames      │
│             │ NO usa ffmpeg (captura en navegador con JS)          │
│             │ ⚠️ Python cv2/numpy en /api/predict.py sin uso real  │
├─────────────┼──────────────────────────────────────────────────────┤
│ COLAS/CRON  │ ❌ No implementado. Procesamiento síncrono en browser│
└─────────────┴──────────────────────────────────────────────────────┘
```

---

## 2️⃣ DEPENDENCIAS CRÍTICAS Y ANÁLISIS DE VERSIONES

### 📦 Dependencias de Producción

| Package                   | Instalada | Última  | Estado | Observaciones |
|---------------------------|-----------|---------|--------|---------------|
| `react`                   | 19.2.0    | 19.2.0  | ✅ OK  | Versión estable más reciente |
| `react-dom`               | 19.2.0    | 19.2.0  | ✅ OK  | Compatible con React 19 |
| `react-router-dom`        | 7.9.5     | 7.9.5   | ✅ OK  | Última versión |
| `@supabase/supabase-js`   | 2.79.0    | 2.79.0  | ✅ OK  | Cliente Supabase actualizado |
| `@google/genai`           | 1.28.0    | 1.28.0  | ✅ OK  | Cliente Gemini para IA |
| `recharts`                | 3.3.0     | 3.3.0   | ✅ OK  | Gráficos y visualización |
| `tslib`                   | 2.8.1     | 2.8.1   | ✅ OK  | Utilidades TypeScript |

### 🛠 Dependencias de Desarrollo

| Package                   | Instalada | Última  | Estado | Observaciones |
|---------------------------|-----------|---------|--------|---------------|
| `vite`                    | 6.4.1     | **7.1.12** | ⚠️ OUTDATED | Actualizar a v7 (breaking changes) |
| `@types/node`             | 22.19.0   | **24.10.0** | ⚠️ OUTDATED | Actualizar tipos de Node |
| `typescript`              | 5.9.3     | 5.9.3   | ✅ OK  | Versión estable |
| `@vitejs/plugin-react`    | 5.1.0     | 5.1.0   | ✅ OK  | Plugin Vite para React |

### 🎥 DEPENDENCIAS DE VIDEO Y PROCESAMIENTO IA

```diff
+ ✅ FRONTEND: HTML5 Video API + Canvas API (nativas browser)
+ ✅ IA: @google/genai@1.28.0 (análisis de frames)
- ❌ FFmpeg: NO instalado en sistema (no requerido actualmente)
- ⚠️ api/predict.py: Importa cv2 y numpy SIN usar (función mock)
```

**⚠️ ALERTAS DE SEGURIDAD**:
- No se pudo ejecutar `npm audit` (falta package-lock.json)
- **ACCIÓN REQUERIDA**: Generar lockfile con `npm install --package-lock-only`

**🔴 VULNERABILIDADES POTENCIALES**:
1. **Credenciales hardcodeadas** en `services/supabaseClient.ts` (líneas 5-6)
2. **ADMIN_CREATION_TOKEN** sin rotación automática
3. **SUPABASE_SERVICE_ROLE_KEY** expuesto en serverless functions (riesgo si se filtran logs)

---

## 3️⃣ ENDPOINTS Y FLUJOS CRÍTICOS

### 🔐 **FLUJO 1: Autenticación y Login**

**Endpoint**: Supabase Auth (`supabase.auth.signInWithPassword`)  
**Archivos Implicados**:
- `components/auth/Login.tsx` (líneas 16-31)
- `components/auth/Register.tsx` (líneas 17-36)
- `contexts/AuthContext.tsx` (líneas 75-93)
- `services/supabaseClient.ts` (líneas 1-12)

**Funciones Clave**:
```typescript
// AuthContext.tsx
signIn(email, password) → supabase.auth.signInWithPassword()
signUp(email, password) → supabase.auth.signUp()
```

**Flujo**:
1. Usuario ingresa email/password en `AuthPage`
2. `AuthContext.signIn()` llama a Supabase Auth
3. Si éxito → obtiene `session` y `user`
4. Busca `profile` en tabla `profiles` (líneas 30-46)
5. Redirige a `/dashboard` si autenticado

**⚠️ PRUEBAS NECESARIAS**:
- ✅ Login con credenciales válidas
- ✅ Login con credenciales inválidas
- ✅ Registro de nuevo usuario
- ❌ Validación de email duplicado
- ❌ Manejo de errores de red
- ❌ Session timeout/refresh

---

### 📤 **FLUJO 2: Upload y Procesamiento de Video**

**Endpoint**: Cliente (NO hay upload real a backend)  
**Archivos Implicados**:
- `pages/VideoTaggerPage.tsx` (líneas 30-47, 355-390)
- `services/geminiService.ts` (líneas 29-78)
- `utils/blob.ts` (líneas 2-16)

**Funciones Clave**:
```typescript
// VideoTaggerPage.tsx
handleVideoFileChange() → almacena archivo en estado local
handleAnalyzeAI() → extrae frames del video en canvas
  ↓
// geminiService.ts
analyzeVideoFrames(frames, existingTags) → envía a Gemini API
  → retorna AISuggestion[]
```

**Flujo**:
1. Usuario selecciona archivo de video local (input type="file")
2. Video se carga en `<video>` mediante `URL.createObjectURL()`
3. Al presionar "Analizar con IA":
   - Se extraen 8 frames (cada 2 segundos hacia atrás)
   - Canvas captura cada frame como imagen JPEG
   - `blobToBase64()` convierte a base64
   - Se envían frames a Gemini API con prompt de análisis
4. Gemini retorna sugerencias de jugadas detectadas
5. Se muestran en modal `AISuggestionsModal`

**⚠️ PRUEBAS NECESARIAS**:
- ✅ Upload de video .mp4 válido
- ❌ Upload de video corrupto
- ❌ Upload de archivo NO-video
- ❌ Video > 100MB (límite navegador)
- ❌ Gemini API timeout/error handling
- ❌ Frame extraction con video de diferentes resoluciones

---

### 🎯 **FLUJO 3: Creación de Tags (Acciones de Jugadores)**

**Endpoint**: Supabase (`supabase.from('tags').insert()`)  
**Archivos Implicados**:
- `pages/VideoTaggerPage.tsx` (líneas 48-53, 426-467)
- `services/supabaseClient.ts` (RLS policies comentadas líneas 30-34)

**Funciones Clave**:
```typescript
// VideoTaggerPage.tsx (handleSaveTag)
const newTag = {
  match_id, player_id, accion, resultado, timestamp,
  video_file, timestamp_absolute
};
await supabase.from('tags').insert([newTag]);
```

**Flujo**:
1. Usuario reproduce video y pausa en momento clave
2. Selecciona jugador y acción de los dropdowns
3. Presiona "Guardar Tag"
4. Se crea objeto `Tag` con timestamp del video
5. INSERT en tabla `tags` (protegido por RLS: solo admins)
6. Se actualiza lista local de tags

**⚠️ PRUEBAS NECESARIAS**:
- ✅ Admin crea tag correctamente
- ❌ Auxiliar intenta crear tag (debe fallar por RLS)
- ❌ Tag sin player_id (validación)
- ❌ Tag sin match_id (validación)
- ❌ Duplicación de tags en mismo timestamp

---

### 👥 **FLUJO 4: Creación de Usuarios Administrativos**

**Endpoint**: `/api/admin/create-user` (serverless Vercel)  
**Archivos Implicados**:
- `api/admin/create-user.ts` (líneas 1-96)
- `api/admin/create-user-proxy.ts` (líneas 1-120)

**Funciones Clave**:
```typescript
// create-user.ts
POST /api/admin/create-user
Headers: { "X-ADMIN-TOKEN": "secret" }
Body: { email, password, role, team_id, full_name }
  ↓
supabaseAdmin.auth.admin.createUser() → bypasses RLS
supabaseAdmin.from('profiles').upsert()
```

**Flujo**:
1. Admin envía POST con token secreto en header
2. Serverless valida `ADMIN_CREATION_TOKEN`
3. Crea usuario en Supabase Auth con service role key
4. Inserta/actualiza perfil en tabla `profiles`
5. Retorna user ID y email

**⚠️ PRUEBAS NECESARIAS**:
- ✅ Creación con token válido
- ❌ Creación sin token (401)
- ❌ Creación con email duplicado
- ❌ Validación de roles (admin/auxiliar/user)
- ❌ Manejo de errores de Supabase

---

### 📊 **FLUJO 5: Dashboard y Obtención de Resultados**

**Endpoint**: Supabase (`supabase.from('tags').select()`)  
**Archivos Implicados**:
- `pages/DashboardPage.tsx` (líneas estimadas 1-300+)
- `services/supabaseClient.ts`

**Funciones Clave**:
```typescript
// DashboardPage.tsx
useEffect(() => {
  const fetchTags = async () => {
    const { data } = await supabase
      .from('tags')
      .select('*, player:players(*), match:matches(*)');
    // Procesar y visualizar con Recharts
  };
}, []);
```

**Flujo**:
1. Usuario autenticado navega a `/dashboard`
2. Se obtienen tags con JOIN a players y matches
3. Se agregan métricas por acción/jugador/partido
4. Se renderizan gráficos con Recharts
5. RLS permite lectura a usuarios autenticados

**⚠️ PRUEBAS NECESARIAS**:
- ✅ Dashboard carga con datos
- ❌ Dashboard sin datos (estado vacío)
- ❌ Performance con >1000 tags
- ❌ Filtros por fecha/jugador/partido

---

## 4️⃣ TABLAS SUPABASE (YA CREADAS - SEGÚN USUARIO)

Según tu indicación, ya tienes las tablas creadas. **Verificación requerida**:

```sql
-- ✅ Verifica que existan estas tablas y políticas RLS:
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- ✅ Verifica políticas RLS activas:
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- ✅ Verifica trigger handle_new_user:
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

**⚠️ SI FALTAN TABLAS**, comparte el esquema actual y te genero las migraciones necesarias.

---

## 5️⃣ SOLUCIÓN PASO A PASO (PROPUESTA TÉCNICA)

### **PROBLEMA 1: FFmpeg no instalado (pero no se usa actualmente)**

**Contexto**: El código importa `cv2` y `numpy` en `api/predict.py` pero NO los usa. El procesamiento de video ocurre en browser con Canvas API.

**Opciones**:

**A) Mantener procesamiento en browser (recomendado para MVP)**
```bash
# NO hacer nada - funciona sin ffmpeg
```

**B) Agregar ffmpeg para procesamiento server-side (futuro)**
```bash
# Archivo: .replit
[nix]
channel = "stable-24_05"

[nix.packages]
pkgs = [
  "nodejs-20_x",
  "ffmpeg-full"
]
```

**Modificar**: `api/predict.py` para procesar video con ffmpeg + OpenCV.

---

### **PROBLEMA 2: Falta package-lock.json (seguridad)**

**Solución**:
```bash
npm install --package-lock-only
npm audit fix
```

**Archivos a modificar**: NINGUNO  
**Comando de prueba**:
```bash
npm audit --production
```

---

### **PROBLEMA 3: Credenciales hardcodeadas**

**Archivo**: `services/supabaseClient.ts` (líneas 5-6)

**Antes**:
```typescript
const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL || 'https://gmbmzihuskknkrstxveu.supabase.co';
const supabaseKey = (import.meta as any)?.env?.VITE_SUPABASE_KEY || 'eyJhbGci...';
```

**Después**:
```typescript
const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL;
const supabaseKey = (import.meta as any)?.env?.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ CRITICAL: Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in Replit Secrets.");
}
```

**Comando de prueba**:
```bash
# Verificar que las secrets están en Replit
env | grep VITE_SUPABASE
```

---

### **PROBLEMA 4: Actualizar Vite a v7**

**Archivo**: `package.json`

**Comando**:
```bash
npm install vite@latest --save-dev
```

**⚠️ Breaking Changes**: Revisar [Vite 7 Migration Guide](https://vitejs.dev/guide/migration.html)

**Posibles cambios en**: `vite.config.ts` (nueva sintaxis de plugins)

---

### **PROBLEMA 5: Falta validación de entrada en API**

**Archivo**: `api/admin/create-user.ts` (líneas 40-45)

**Agregar validación de email**:
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!email || !emailRegex.test(email)) {
  return res.status(400).json({ error: 'Invalid email format' });
}

if (password.length < 8) {
  return res.status(400).json({ error: 'Password must be at least 8 characters' });
}

const validRoles = ['admin', 'auxiliar', 'user'];
if (!validRoles.includes(role)) {
  return res.status(400).json({ error: 'Invalid role. Must be admin, auxiliar, or user' });
}
```

---

### **PROBLEMA 6: api/predict.py no se usa (código muerto)**

**Opciones**:

**A) Eliminar archivo** (recomendado si no hay plan de usarlo):
```bash
rm api/predict.py
```

**B) Implementar modelo real** (si quieres usarlo):
```python
# Descargar modelo pre-entrenado
# Cargar con TensorFlow/PyTorch
# Procesar frames y retornar predicciones
```

---

## 6️⃣ TESTS AUTOMÁTICOS SUGERIDOS

### 📁 Estructura de Tests Propuesta

```
tests/
├── unit/
│   ├── utils/
│   │   ├── blob.test.ts
│   │   └── time.test.ts
│   ├── services/
│   │   ├── geminiService.test.ts
│   │   └── videosService.test.ts
│   └── components/
│       ├── Login.test.tsx
│       └── Register.test.tsx
├── integration/
│   ├── auth-flow.test.ts
│   ├── video-tagging.test.ts
│   └── dashboard.test.ts
└── e2e/
    └── complete-workflow.test.ts
```

### 📝 **TEST 1: Unit Test - blobToBase64**

**Archivo**: `tests/unit/utils/blob.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { blobToBase64 } from '../../../utils/blob';

describe('blobToBase64', () => {
  it('should convert Blob to base64 string', async () => {
    const testString = 'Hello World';
    const blob = new Blob([testString], { type: 'text/plain' });
    
    const result = await blobToBase64(blob);
    
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result).not.toContain('data:');
  });

  it('should handle image blobs', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg');
    });
    
    const result = await blobToBase64(blob);
    
    expect(result).toBeTruthy();
    expect(result?.length).toBeGreaterThan(0);
  });

  it('should return null for invalid blob', async () => {
    const blob = new Blob([], { type: 'invalid' });
    const result = await blobToBase64(blob);
    
    expect(result).toBeDefined();
  });
});
```

---

### 📝 **TEST 2: Integration Test - Auth Flow**

**Archivo**: `tests/integration/auth-flow.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import Login from '../../components/auth/Login';
import { supabase } from '../../services/supabaseClient';

// Mock Supabase
vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    }))
  }
}));

describe('Authentication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully login with valid credentials', async () => {
    const mockSession = {
      user: { id: '123', email: 'test@test.com' },
      access_token: 'token'
    };

    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: mockSession },
      error: null
    });

    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: mockSession },
      error: null
    });

    const { getByLabelText, getByText } = render(
      <AuthProvider>
        <Login onSwitchToRegister={() => {}} />
      </AuthProvider>
    );

    fireEvent.change(getByLabelText(/correo/i), { target: { value: 'test@test.com' } });
    fireEvent.change(getByLabelText(/contraseña/i), { target: { value: 'password123' } });
    fireEvent.click(getByText(/iniciar sesión/i));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'password123'
      });
    });
  });

  it('should show error with invalid credentials', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' }
    });

    const { getByLabelText, getByText } = render(
      <AuthProvider>
        <Login onSwitchToRegister={() => {}} />
      </AuthProvider>
    );

    fireEvent.change(getByLabelText(/correo/i), { target: { value: 'wrong@test.com' } });
    fireEvent.change(getByLabelText(/contraseña/i), { target: { value: 'wrong' } });
    fireEvent.click(getByText(/iniciar sesión/i));

    await waitFor(() => {
      expect(screen.getByText(/incorrectos/i)).toBeInTheDocument();
    });
  });
});
```

---

### 📝 **TEST 3: Integration Test - Video Tagging**

**Archivo**: `tests/integration/video-tagging.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VideoTaggerPage from '../../pages/VideoTaggerPage';
import { AuthProvider } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';

vi.mock('../../services/supabaseClient');
vi.mock('../../services/geminiService');

describe('Video Tagging Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock authenticated admin user
    (supabase.auth.getSession as any).mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-123', email: 'admin@test.com' }
        }
      }
    });
    
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'admin-123', rol: 'admin' }
      })
    });
  });

  it('should load video file and display in player', async () => {
    const { getByLabelText } = render(
      <AuthProvider>
        <VideoTaggerPage />
      </AuthProvider>
    );

    const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
    const input = getByLabelText(/seleccionar video/i) as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(input.files?.[0]).toBe(file);
    });
  });

  it('should create tag with valid data', async () => {
    (supabase.from as any).mockReturnValue({
      insert: vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis()
    });

    const { getByText } = render(
      <AuthProvider>
        <VideoTaggerPage />
      </AuthProvider>
    );

    // Simulate tag creation flow
    fireEvent.click(getByText(/guardar tag/i));

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('tags');
    });
  });
});
```

---

### 📝 **TEST 4: E2E Test - Complete Workflow**

**Archivo**: `tests/e2e/complete-workflow.test.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Complete User Workflow', () => {
  test('admin can login, upload video, create tags, and view dashboard', async ({ page }) => {
    // 1. Login
    await page.goto('http://localhost:5000/');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Iniciar Sesión")');
    
    await expect(page).toHaveURL(/.*dashboard/);

    // 2. Navigate to Tagger
    await page.click('a:has-text("Video Tagger")');
    await expect(page).toHaveURL(/.*tagger/);

    // 3. Upload video
    await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample-video.mp4');
    await expect(page.locator('video')).toBeVisible();

    // 4. Create tag
    await page.selectOption('select#player-select', { index: 1 });
    await page.selectOption('select#action-select', { index: 1 });
    await page.click('button:has-text("Guardar Tag")');
    
    await expect(page.locator('text=Tag guardado')).toBeVisible();

    // 5. View dashboard
    await page.click('a:has-text("Dashboard")');
    await expect(page.locator('.recharts-wrapper')).toBeVisible();
  });
});
```

---

### 🛠 **Configuración de Tests**

**Archivo**: `package.json` (agregar scripts)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:coverage": "vitest --coverage"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@testing-library/jest-dom": "^6.9.0",
    "@testing-library/user-event": "^14.5.2",
    "@playwright/test": "^1.49.0",
    "@vitest/ui": "^3.0.5",
    "vitest": "^3.0.5",
    "jsdom": "^25.0.0"
  }
}
```

**Archivo**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  }
});
```

**Archivo**: `tests/setup.ts`

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock HTMLMediaElement
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
```

---

## 7️⃣ PR TEMPLATE Y MENSAJE DE COMMIT

### 📋 **Pull Request Template**

**Archivo**: `.github/pull_request_template.md`

```markdown
## 🎯 Objetivo del PR

<!-- Describe brevemente qué problema resuelve este PR -->

## 🔄 Cambios Realizados

<!-- Lista de cambios principales -->
- [ ] Actualización de dependencias
- [ ] Nuevas features
- [ ] Corrección de bugs
- [ ] Refactorización
- [ ] Tests agregados

## 🧪 Testing

<!-- Describe las pruebas realizadas -->
- [ ] Tests unitarios pasando
- [ ] Tests de integración pasando
- [ ] Prueba manual en entorno local
- [ ] Prueba manual en Replit

## 📸 Screenshots (si aplica)

<!-- Agrega capturas de pantalla de cambios visuales -->

## ⚠️ Breaking Changes

<!-- Lista cambios que rompen compatibilidad -->
- Ninguno
- [Describir breaking change]

## 📝 Checklist

- [ ] El código sigue las convenciones del proyecto
- [ ] He actualizado la documentación (si aplica)
- [ ] He agregado tests que cubren mis cambios
- [ ] Todos los tests nuevos y existentes pasan
- [ ] He verificado que no hay credenciales hardcodeadas
- [ ] He probado en Replit (rama `test`)

## 🔗 Issues Relacionados

Closes #[número]

## 👥 Reviewers Sugeridos

@[usuario]
```

---

### 💬 **Mensaje de Commit Ideal**

#### **Estructura**:
```
<tipo>(<alcance>): <descripción breve>

<cuerpo opcional: explicación detallada>

<footer opcional: breaking changes, issues cerrados>
```

#### **Tipos de Commit**:
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `refactor`: Refactorización de código
- `test`: Agregar o modificar tests
- `docs`: Cambios en documentación
- `chore`: Tareas de mantenimiento
- `perf`: Mejoras de performance
- `style`: Cambios de formato (no afectan lógica)

#### **Ejemplos**:

```bash
# Ejemplo 1: Configuración Replit
git commit -m "chore(config): configurar Vite para Replit en puerto 5000

- Actualizar vite.config.ts con allowedHosts: true
- Configurar HMR clientPort: 443 para proxy de Replit
- Cambiar puerto de 3000 a 5000 para compatibilidad con webview

BREAKING CHANGE: El servidor ahora corre en puerto 5000 en lugar de 3000"
```

```bash
# Ejemplo 2: Remover credenciales hardcodeadas
git commit -m "fix(security): eliminar credenciales hardcodeadas de supabaseClient

- Remover valores por defecto de supabaseUrl y supabaseKey
- Agregar validación estricta de variables de entorno
- Lanzar error claro si faltan VITE_SUPABASE_URL o VITE_SUPABASE_KEY

Closes #42"
```

```bash
# Ejemplo 3: Agregar tests
git commit -m "test(auth): agregar tests de integración para flujo de autenticación

- Crear tests para login exitoso y fallido
- Mockear supabase client en tests
- Configurar vitest y @testing-library/react
- Agregar coverage al 80% en AuthContext y componentes de auth"
```

```bash
# Ejemplo 4: Actualizar dependencias
git commit -m "chore(deps): actualizar Vite de v6.4.1 a v7.1.12

- Migrar configuración según breaking changes de Vite 7
- Actualizar @types/node a v24.10.0
- Generar package-lock.json para seguridad

BREAKING CHANGE: Vite 7 requiere Node.js >= 18.0.0"
```

---

## 8️⃣ RIESGOS Y RECOMENDACIONES

### 🔴 **CRÍTICO**

1. **Credenciales expuestas en código**: Remover fallbacks en `supabaseClient.ts`
2. **Falta package-lock.json**: Ejecutar `npm install --package-lock-only`
3. **No hay tests**: Implementar suite de tests con Vitest

### ⚠️ **IMPORTANTE**

1. **Vite v6 desactualizado**: Actualizar a v7 (breaking changes)
2. **No hay validación de entrada**: Agregar sanitización en APIs
3. **api/predict.py sin uso**: Eliminar o implementar

### ℹ️ **MEJORAS OPCIONALES**

1. **Agregar ESLint + Prettier**: Estandarizar formato de código
2. **Implementar CI/CD**: GitHub Actions para tests automáticos
3. **Agregar Sentry**: Monitoreo de errores en producción
4. **Rate limiting**: Proteger endpoints `/api/admin/*`

---

## 9️⃣ COMANDOS DE EJECUCIÓN

### 🚀 **Setup Inicial**

```bash
# 1. Instalar dependencias
npm install

# 2. Generar lockfile
npm install --package-lock-only

# 3. Auditar seguridad
npm audit fix

# 4. Configurar tests
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

### 🧪 **Ejecutar Tests**

```bash
# Tests unitarios
npm run test

# Tests con UI interactiva
npm run test:ui

# Tests E2E (requiere Playwright)
npx playwright install
npm run test:e2e

# Coverage
npm run test:coverage
```

### 🏃 **Desarrollo**

```bash
# Iniciar servidor dev (puerto 5000)
npm run dev

# Build para producción
npm run build

# Preview de producción
npm run preview
```

### 🔍 **Validaciones**

```bash
# Verificar tipos TypeScript
npx tsc --noEmit

# Listar dependencias obsoletas
npm outdated

# Verificar secrets en Replit
env | grep VITE_
```

---

## 🎯 RESUMEN EJECUTIVO (5 LÍNEAS)

**Estado Actual**: Aplicación funcional en Replit (puerto 5000), dependencias mayormente actualizadas, arquitectura sólida con React 19 + Supabase. **Riesgos Críticos**: Credenciales hardcodeadas en código, falta de tests automatizados, y ausencia de package-lock.json. **Deuda Técnica**: Actualización pendiente de Vite v6 → v7, código muerto en `api/predict.py`, y validación de entrada insuficiente en endpoints administrativos. **Prioridad Inmediata**: Remover credenciales, generar lockfile, e implementar suite básica de tests (cobertura mínima 60%). **Plan de Acción**: Seguir los 3 pasos prioritarios detallados a continuación para estabilizar el proyecto antes de agregar nuevas features.

---

## ✅ 3 PASOS PRIORITARIOS EN RAMA `test`

### **PASO 1: Seguridad y Estabilidad** ⏱️ 30 min
```bash
# a) Generar lockfile
npm install --package-lock-only

# b) Remover credenciales hardcodeadas
# Editar services/supabaseClient.ts (remover fallbacks líneas 5-6)
# Agregar throw Error si faltan variables de entorno

# c) Crear .env.example
echo "VITE_SUPABASE_URL=your_supabase_url" > .env.example
echo "VITE_SUPABASE_KEY=your_supabase_anon_key" >> .env.example
echo "VITE_API_KEY=your_gemini_api_key" >> .env.example

# d) Auditar y corregir vulnerabilidades
npm audit fix
```

**Archivos a Modificar**:
- `services/supabaseClient.ts`
- `package-lock.json` (nuevo)
- `.env.example` (nuevo)

---

### **PASO 2: Tests Básicos** ⏱️ 2 horas
```bash
# a) Instalar dependencias de testing
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/ui

# b) Crear archivos de configuración
# vitest.config.ts, tests/setup.ts (ver sección 6)

# c) Crear tests prioritarios
# tests/unit/utils/blob.test.ts
# tests/integration/auth-flow.test.ts

# d) Ejecutar tests
npm run test
```

**Archivos a Crear**:
- `vitest.config.ts`
- `tests/setup.ts`
- `tests/unit/utils/blob.test.ts`
- `tests/integration/auth-flow.test.ts`

---

### **PASO 3: Limpieza y Documentación** ⏱️ 1 hora
```bash
# a) Eliminar código muerto
rm api/predict.py  # (si no se va a usar)

# b) Actualizar replit.md
# Documentar cambios realizados en PASO 1 y 2

# c) Crear PR hacia main
git add .
git commit -m "chore(setup): configurar entorno Replit, tests y seguridad

- Configurar Vite puerto 5000 con allowedHosts
- Remover credenciales hardcodeadas
- Agregar suite básica de tests (Vitest)
- Generar package-lock.json
- Eliminar código sin uso (api/predict.py)"

# d) Esperar aprobación ANTES de push
echo "⚠️ CONFIRMAR CON USUARIO ANTES DE git push"
```

**Archivos a Modificar**:
- `replit.md`
- `.github/pull_request_template.md` (nuevo)

---

## 📊 MÉTRICAS DE ÉXITO

| Métrica | Antes | Después PASO 1-3 | Objetivo Final |
|---------|-------|------------------|----------------|
| Cobertura de Tests | 0% | 40% | 80% |
| Vulnerabilidades npm | ? | 0 | 0 |
| Credenciales en código | 2 | 0 | 0 |
| Código muerto | 1 archivo | 0 | 0 |
| Documentación | Básica | Completa | Completa |

---

## 🔗 RECURSOS ADICIONALES

- [Vite 7 Migration Guide](https://vitejs.dev/guide/migration.html)
- [Vitest Documentation](https://vitest.dev/)
- [Supabase RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

---

**Fin del Análisis Integral** | Generado: 2025-11-04 | Branch: `test` | Analista: Senior Full-Stack Developer
