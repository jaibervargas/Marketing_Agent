import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let supabase = null;

async function initSupabase() {
  const url = localStorage.getItem('supabase_url') || '';
  const key = localStorage.getItem('supabase_anon') || '';
  
  if (!url || !key) {
    supabase = null;
    return;
  }
  
  if (!/^https?:\/\//i.test(url)) {
    console.warn('Invalid Supabase URL:', url);
    supabase = null;
    return;
  }
  
  try {
    supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,  // This will process the hash
      },
    });
  } catch (e) {
    console.error('Error creating Supabase client:', e);
    supabase = null;
  }
}

initSupabase();

export { supabase };

export function isSupabaseConfigured() {
  return !!supabase;
}

export function getSupabaseConfig() {
  return {
    url: localStorage.getItem('supabase_url') || '',
    anonKey: localStorage.getItem('supabase_anon') || '',
  };
}

export function setSupabaseConfig(url, anonKey) {
  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_anon', anonKey);
  initSupabase();
}

export async function signUp(email, password) {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase no configurado');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  // Clear the hash if present
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
}

export async function getCurrentUser() {
  if (!supabase) return null;
  
  // First check for existing session
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) return sessionData.session.user;
  
  // Check if there's a hash with token (from email confirmation)
  if (window.location.hash && window.location.hash.includes('access_token')) {
    const { data, error } = await supabase.auth.getSession();
    if (data?.session?.user) return data.session.user;
  }
  
  return null;
}

export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session?.user || null);
  });
}

// ============= SUSCRIPCIÓN Y PERFILES =============

export async function getUserProfile(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function createProfileIfNotExists(userId, email) {
  if (!supabase) return;
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  
  if (!existing) {
    await supabase.from('profiles').insert({
      id: userId,
      role: 'user',
      is_active: false,
    });
  }
}

export async function checkSubscription(userId) {
  if (!supabase) return { plan: 'free', is_validated: false, requests_today: 0 };
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  
  return {
    plan: subscription?.plan || 'free',
    status: subscription?.status || 'inactive',
    is_validated: profile?.is_active || false,
    role: profile?.role || 'user',
    requests_today: subscription?.requests_today || 0,
    requests_reset_at: subscription?.requests_reset_at,
  };
}

const PLAN_LIMITS = {
  free: 10,
  pro: 100,
  enterprise: 999999,
};

export async function checkAndIncrementUsage(userId) {
  if (!supabase) return { allowed: true, limit: 10 };
  
  const sub = await checkSubscription(userId);
  
  if (!sub.is_validated) {
    return { allowed: false, reason: 'pending_validation', limit: 0 };
  }
  
  const limit = PLAN_LIMITS[sub.plan] || 10;
  
  if (sub.requests_today >= limit) {
    return { allowed: false, reason: 'limit_exceeded', limit, used: sub.requests_today };
  }
  
  const now = new Date();
  const resetAt = sub.requests_reset_at ? new Date(sub.requests_reset_at) : now;
  const shouldReset = now.toDateString() !== resetAt.toDateString();
  
  if (shouldReset) {
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      requests_today: 1,
      requests_reset_at: now.toISOString(),
      plan: sub.plan,
      status: 'active',
    }, { onConflict: 'user_id' });
  } else {
    await supabase.rpc('increment_requests', { user_uuid: userId });
  }
  
  return { allowed: true, limit, used: sub.requests_today + 1 };
}

export async function getUserApiKeys(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
  return data || [];
}

export async function saveUserApiKey(userId, provider, apiKey) {
  if (!supabase) throw new Error('Supabase no configurado');
  
  const encrypted = btoa(apiKey);
  
  const { error } = await supabase.from('user_api_keys').upsert({
    user_id: userId,
    provider: provider,
    api_key_encrypted: encrypted,
    is_active: true,
  }, { onConflict: 'user_id,provider' });
  
  if (error) throw error;
}

export async function deleteUserApiKey(userId, provider) {
  if (!supabase) return;
  await supabase
    .from('user_api_keys')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('provider', provider);
}

// Funciones de ADMIN
export async function getAllProfiles() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}

export async function validateUser(userId, validatedBy, isActive) {
  if (!supabase) return;
  await supabase.from('profiles').update({
    validated_by: validatedBy,
    validated_at: new Date().toISOString(),
    is_active: isActive,
  }).eq('id', userId);
}

export async function updateUserPlan(userId, plan) {
  if (!supabase) return;
  await supabase.from('subscriptions').upsert({
    user_id: userId,
    plan: plan,
    status: 'active',
  }, { onConflict: 'user_id' });
}

export async function getAllSubscriptions() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}