import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildPushMessage, classifyFcmResponse } from '../_shared/push-delivery.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// Generate JWT for Google OAuth2
async function createJWT(serviceAccount: ServiceAccount): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  };

  const base64Header = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const base64Payload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${base64Header}.${base64Payload}`;

  // Import the private key
  const pemContents = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${unsignedToken}.${base64Signature}`;
}

// Get OAuth2 access token
async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const jwt = await createJWT(serviceAccount);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }
  
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStarted = Date.now();
  let alertId = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create client with user's token to verify authentication
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify the JWT token and get user claims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Invalid token: missing user ID' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get sender info from database instead of trusting client
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, is_active')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profile.is_active === false) {
      return new Response(JSON.stringify({ error: 'Account is inactive' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const senderName = profile.full_name || 'Unknown';
    const senderAvatar = profile.avatar_url || '';

    // Optional body params to customize the notification (backward compatible)
    let bodyJson: any = {};
    try { bodyJson = await req.json(); } catch { bodyJson = {}; }
    if (typeof bodyJson?.alert_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bodyJson.alert_id)) {
      alertId = bodyJson.alert_id;
    }
    const notifType = (bodyJson?.type as string) || 'gate_alert';
    const isLocation = notifType === 'location_share';
    const title = (bodyJson?.title as string) || (isLocation ? '📍 Location shared' : '🚨 Gate Alert!');
    const body = (bodyJson?.body as string) || (isLocation
      ? `${senderName} shared their location`
      : `${senderName} is requesting gate access!`);
    const tag = (bodyJson?.tag as string) || (isLocation ? 'location-share' : 'gate-alert');
    const requestedUrl = typeof bodyJson?.url === 'string' ? bodyJson.url : '';
    const url = requestedUrl.startsWith('/') && !requestedUrl.startsWith('//') && !requestedUrl.includes('\\')
      ? requestedUrl : (isLocation ? '/locations' : '/');

    // Record the authenticated gate request, including requests made through MCP.
    // This is a request log, not a notification-delivery receipt.
    if (notifType === 'gate_alert') {
      const { error: historyError } = await supabase.from('gate_alert_history').insert({
        id: alertId,
        created_at: sentAt,
        sender_id: userId,
        sender_name: senderName,
        sender_avatar: senderAvatar || null,
      });
      if (historyError) throw historyError;
    }

    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
    }

    const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);


    const target = (bodyJson?.target as string) || 'others'; // 'self' | 'others'
    const dedupePerDay = Boolean(bodyJson?.dedupe_per_day);

    // Once-per-day dedupe (used for arrival/departure reminders)
    if (dedupePerDay && target === 'self') {
      const today = new Date().toISOString().slice(0, 10);
      const { error: dedupeErr } = await supabase
        .from('push_dedupe')
        .insert({ user_id: userId, date: today, tag });
      if (dedupeErr) {
        // Unique-violation => already sent today; short-circuit success
        if ((dedupeErr as any).code === '23505') {
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: 'already_sent_today', tag }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw dedupeErr;
      }
    }


    // Only notify active team members.
    const { data: activeProfiles, error: activeError } = await supabase.from('profiles')
      .select('user_id').eq('is_active', true);
    if (activeError) throw activeError;
    const activeIds = (activeProfiles ?? []).map((p) => p.user_id);
    const tokensQuery = supabase.from('fcm_tokens').select('token').in('user_id', activeIds);
    const { data: tokens, error } = await (
      target === 'self'
        ? tokensQuery.eq('user_id', userId)
        : tokensQuery.neq('user_id', userId)
    );

    if (error) {
      throw error;
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, accepted: 0, failed: 0, attempted: 0, alert_id: alertId, message: 'No registered devices to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getAccessToken(serviceAccount);
    const content = {
      id: alertId, sentAt, title, body, tag, url, type: notifType,
      senderId: userId, senderName, senderAvatar,
    };
    const sendOne = async ({ token }: { token: string }) => {
      try {
        const response = await fetch(
          'https://fcm.googleapis.com/v1/projects/' + serviceAccount.project_id + '/messages:send',
          {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: buildPushMessage(token, content) }),
            signal: AbortSignal.timeout(12_000),
          },
        );
        const result = classifyFcmResponse(response.ok, await response.json());
        console.log(JSON.stringify({
          event: 'push_fcm_result', alert_id: alertId, accepted: result.accepted,
          http_status: response.status, code: result.accepted ? undefined : result.code,
          message_id: result.messageId, elapsed_ms: Date.now() - requestStarted,
        }));
        return { ...result, token };
      } catch {
        // A timeout is ambiguous: do not automatically resend and risk duplicates.
        console.warn(JSON.stringify({ event: 'push_request_failed', alert_id: alertId, elapsed_ms: Date.now() - requestStarted }));
        return { accepted: false, invalidToken: false, code: 'NETWORK_OR_TIMEOUT', token };
      }
    };
    const results: Awaited<ReturnType<typeof sendOne>>[] = [];
    // Bound concurrency so large teams cannot exhaust outgoing connections.
    for (let start = 0; start < tokens.length; start += 10) {
      results.push(...await Promise.all(tokens.slice(start, start + 10).map(sendOne)));
    }
    const expiredTokens = results.filter((r) => r.invalidToken).map((r) => r.token);
    if (expiredTokens.length) {
      const { error: cleanupError } = await supabase.from('fcm_tokens').delete().in('token', expiredTokens);
      if (cleanupError) console.warn('Expired push token cleanup failed:', cleanupError.code);
    }
    const accepted = results.filter((r) => r.accepted).length;
    const failed = results.length - accepted;
    console.log(JSON.stringify({
      event: 'push_summary', alert_id: alertId, sent_at: sentAt,
      attempted: results.length, accepted, failed, expired: expiredTokens.length,
      elapsed_ms: Date.now() - requestStarted,
    }));
    return new Response(
      JSON.stringify({ success: accepted > 0, accepted, sent: accepted, failed, attempted: results.length, alert_id: alertId, sent_at: sentAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error sending push notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
