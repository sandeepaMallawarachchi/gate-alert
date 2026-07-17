import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

async function createJWT(sa: ServiceAccount): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };
  const b64 = (o: any) =>
    btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const pem = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  const binary = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${unsigned}.${b64sig}`;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const jwt = await createJWT(sa);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`token failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let kind = url.searchParams.get('kind') as 'checkin' | 'checkout' | null;
    if (!kind) {
      try {
        const body = await req.json();
        kind = body?.kind ?? null;
      } catch { /* ignore */ }
    }
    if (kind !== 'checkin' && kind !== 'checkout') {
      return new Response(JSON.stringify({ error: 'kind must be checkin or checkout' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Weekdays only (Mon-Fri) in IST
    const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
    const dow = nowIst.getUTCDay(); // 0 Sun ... 6 Sat
    if (dow === 0 || dow === 6) {
      return new Response(JSON.stringify({ skipped: true, reason: 'weekend' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const today = nowIst.toISOString().slice(0, 10);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load users with active profiles
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('user_id, is_active');
    if (profErr) throw profErr;
    const activeIds = (profiles ?? [])
      .filter((p: any) => p.is_active !== false)
      .map((p: any) => p.user_id);
    if (activeIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load today's attendance rows
    const { data: att } = await supabase
      .from('attendance')
      .select('user_id, check_in_at, check_out_at')
      .eq('date', today)
      .in('user_id', activeIds);
    const attMap = new Map<string, { check_in_at: string | null; check_out_at: string | null }>();
    (att ?? []).forEach((r: any) => attMap.set(r.user_id, r));

    // Determine target users
    const targets: string[] = [];
    for (const uid of activeIds) {
      const row = attMap.get(uid);
      if (kind === 'checkin') {
        if (!row?.check_in_at) targets.push(uid);
      } else {
        if (row?.check_in_at && !row.check_out_at) targets.push(uid);
      }
    }
    if (targets.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dedupe per day per user per kind
    const tag = kind === 'checkin' ? 'daily-reminder-checkin' : 'daily-reminder-checkout';
    const dedupeRows = targets.map((uid) => ({ user_id: uid, date: today, tag }));
    const { error: dedupeErr } = await supabase
      .from('push_dedupe')
      .insert(dedupeRows)
      .select();
    // Ignore conflicts; filter targets to those newly inserted
    const { data: inserted } = await supabase
      .from('push_dedupe')
      .select('user_id')
      .eq('date', today)
      .eq('tag', tag)
      .in('user_id', targets);
    const okTargets = new Set((inserted ?? []).map((r: any) => r.user_id));
    if (dedupeErr && (dedupeErr as any).code !== '23505') {
      console.warn('dedupe insert warning', dedupeErr);
    }

    // Fetch tokens for target users
    const { data: tokens } = await supabase
      .from('fcm_tokens')
      .select('token, user_id')
      .in('user_id', Array.from(okTargets));
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!saJson) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
    const sa: ServiceAccount = JSON.parse(saJson);
    const accessToken = await getAccessToken(sa);

    const title = kind === 'checkin' ? '⏰ Time to check in' : '⏰ Time to check out';
    const body =
      kind === 'checkin'
        ? "Don't forget to mark your attendance for today."
        : "Don't forget to check out before you leave.";

    const sends = tokens.map(({ token, user_id }) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data: {
              sender_id: 'system',
              sender_name: 'Attendance',
              sender_avatar: '',
              type: 'attendance',
              title,
              body,
              tag,
              url: '/attendance',
            },
            android: { priority: 'high' },
            webpush: { headers: { Urgency: 'high', TTL: '300' } },
            apns: {
              headers: { 'apns-priority': '10', 'apns-push-type': 'background' },
              payload: { aps: { 'content-available': 1 } },
            },
          },
        }),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
    );
    const results = await Promise.all(sends);
    console.log(`daily-reminder ${kind}: ${tokens.length} sends`, results);

    return new Response(
      JSON.stringify({ sent: tokens.length, kind, targets: okTargets.size }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('daily-reminder error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
