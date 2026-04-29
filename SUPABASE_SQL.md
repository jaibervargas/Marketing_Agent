# SQL de Supabase - Marketing Agent v5

Este archivo contiene todas las consultas SQL necesarias para configurar el sistema de suscripciones en Supabase.

---

## 1. Tablas principales

Ejecutar en SQL Editor de Supabase:

```sql
-- ============================================
-- 1. TABLA DE SUSCRIPCIONES
-- ============================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due')),
  requests_today INT DEFAULT 0,
  requests_reset_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. TABLA DE PERFILES
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) NOT NULL,
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 3. TABLA DE API KEYS POR USUARIO
-- ============================================
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. Políticas RLS (Row Level Security)

```sql
-- Habilitar RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- El usuario solo ve su propia suscripción
CREATE POLICY "users own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- El usuario solo ve su propio perfil
CREATE POLICY "users own profile" ON profiles
  FOR ALL USING (auth.uid() = id);

-- El usuario solo ve sus propias keys
CREATE POLICY "users own keys" ON user_api_keys
  FOR ALL USING (auth.uid() = user_id);

-- Los admins ven todos los perfiles
CREATE POLICY "admins see all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Los admins pueden actualizar cualquier perfil
CREATE POLICY "admins update profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

---

## 3. Índices

```sql
-- Índices para mejor rendimiento
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_id ON profiles(id);
CREATE INDEX idx_user_api_keys_user ON user_api_keys(user_id);
```

---

## 4. Función RPC para incrementar requests

```sql
-- Función para incrementar contador de requests
CREATE OR REPLACE FUNCTION increment_requests(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE subscriptions 
  SET requests_today = COALESCE(requests_today, 0) + 1,
      updated_at = NOW()
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. Hacer usuario Admin

**IMPORTANT**: Reemplazar `tu_email@email.com` con el email real del usuario.

```sql
-- HACER ADMIN A UN USUARIO (ejecutar DESPUÉS del registro)

-- Opción 1: Si el perfil ya existe
UPDATE profiles 
SET role = 'admin', is_active = true 
WHERE id = (SELECT id FROM auth.users WHERE email = 'jaibercastillo16@gmail.com' LIMIT 1);

-- Opción 2: Si no existe el perfil, crearlo
INSERT INTO profiles (id, role, is_active)
SELECT id, 'admin', true 
FROM auth.users 
WHERE email = 'jaibercastillo16@gmail.com'
ON CONFLICT (id) DO NOTHING;
```

---

## 6. Función para verificar suscripción (opcional)

```sql
-- Función para obtener estado de suscripción de un usuario
CREATE OR REPLACE FUNCTION check_user_subscription(user_id UUID)
RETURNS JSONB AS $$
DECLARE
  sub RECORD;
  profile RECORD;
BEGIN
  -- Get subscription
  SELECT * INTO sub FROM subscriptions WHERE user_id = check_user_subscription.user_id AND status = 'active';
  
  -- Get profile  
  SELECT * INTO profile FROM profiles WHERE id = check_user_subscription.user_id;
  
  RETURN JSONB_BUILD_OBJECT(
    'has_subscription', sub IS NOT NULL,
    'plan', COALESCE(sub.plan, 'free'),
    'status', COALESCE(sub.status, 'inactive'),
    'is_validated', profile.is_active,
    'role', COALESCE(profile.role, 'user'),
    'requests_today', COALESCE(sub.requests_today, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 📋 Orden de ejecución recomendado

1. **Sección 1**: Ejecutar primero (crea las tablas)
2. **Sección 2**: Ejecutar políticas RLS
3. **Sección 3**: Ejecutar índices
4. **Sección 4**: Ejecutar función RPC
5. **Sección 5**: Ejecutar DESPUÉS de que el admin se haya registrado

---

## 🔧 Solución de problemas

### Error: "relation does not exist"

Asegúrate de ejecutar las tablas **antes** de las políticas RLS.

### Error: "permission denied"

El usuario anon debe tener permisos. Ejecutar:

```sql
GRANT ALL ON subscriptions TO anon, authenticated;
GRANT ALL ON profiles TO anon, authenticated;
GRANT ALL ON user_api_keys TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_requests TO anon, authenticated;
```

### El usuario no puede iniciar sesión

Verificar que Auth esté habilitado:
- **Authentication → Providers → Email** = habilitado

---

## 📝 Notas

- Las API keys se almacenan encriptadas con `btoa()` (base64)
- Los límites se verifican en el cliente antes de cada request
- El contador se resetea automáticamente (lógica en cliente)
- Solo el admin puede validar usuarios en `admin.html`