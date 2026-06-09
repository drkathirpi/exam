// supabase/functions/ai-proxy/index.ts
//
// Tutor proxy. The Gemini API key is read from Vault via get_ai_key() using the
// service_role and never reaches the browser. AI must be enabled in ai_settings.
//
// Deploy: supabase functions deploy ai-proxy

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Feature = 'explain' | 'simplify' | 'memory' | 'similar' | 'topic_summary' | 'revision';

interface TutorContext {
  question?: string;
  options?: string[];
  answer?: string;
  topic?: string;
  explanation?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SYSTEM =
  'You are a concise paediatric exam tutor helping a doctor prepare for the MRCPCH ' +
  '(FOP/TAS). Be accurate and exam-focused. Prefer UK/RCPCH/NICE/BNFc conventions. ' +
  'Keep answers tight and clinically useful. Do not invent references.';

function clip(s: string | undefined, max = 1500): string {
  return (s ?? '').slice(0, max);
}

function buildPrompt(feature: Feature, c: TutorContext): string {
  const q = clip(c.question);
  const opts = (c.options ?? []).slice(0, 8).map((o, i) => `${i + 1}. ${clip(o, 300)}`).join('\n');
  const topic = clip(c.topic, 120);
  const answer = clip(c.answer, 300);
  const expl = clip(c.explanation);
  const base = `Topic: ${topic}\nQuestion: ${q}\nOptions:\n${opts}\nCorrect answer: ${answer}\nExisting explanation: ${expl}`;

  switch (feature) {
    case 'explain':
      return `${base}\n\nExplain why the correct answer is right and the key distractors are wrong, in 4–6 sentences.`;
    case 'simplify':
      return `${base}\n\nRe-explain the existing explanation in simpler terms a first-year trainee would follow, in 3–4 sentences.`;
    case 'memory':
      return `${base}\n\nGive one or two memorable mnemonics or memory hooks to recall this fact for the exam.`;
    case 'similar':
      return `${base}\n\nWrite one new single-best-answer MRCPCH-style question on the same concept, with 5 options, then state the answer and a one-line rationale.`;
    case 'topic_summary':
      return `Topic: ${topic}\n\nGive a high-yield exam summary of this topic for MRCPCH in about 8 bullet points.`;
    case 'revision':
      return `${base}\n\nProduce concise revision notes on the underlying concept as 5–8 high-yield bullet points.`;
    default:
      return base;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not signed in' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // AI must be enabled
    const { data: settings } = await admin
      .from('ai_settings')
      .select('ai_enabled, gemini_model')
      .eq('id', 1)
      .single();
    if (!settings?.ai_enabled) return json({ error: 'The AI tutor is currently turned off.' }, 403);

    const model = (settings.gemini_model as string) || 'gemini-2.0-flash';

    // Read the key (service_role only function)
    const { data: key } = await admin.rpc('get_ai_key');
    if (!key) return json({ error: 'No AI key is configured.' }, 503);

    const body = (await req.json()) as { feature: Feature; context: TutorContext };
    if (!body?.feature) return json({ error: 'Missing feature' }, 400);

    const prompt = `${SYSTEM}\n\n${buildPrompt(body.feature, body.context ?? {})}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
        }),
      },
    );

    if (!resp.ok) return json({ error: 'The AI service is unavailable right now.' }, 502);
    const data = await resp.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ??
      '';
    if (!text.trim()) return json({ error: 'No response was generated. Try again.' }, 502);

    return json({ text });
  } catch (_err) {
    return json({ error: 'Something went wrong with the AI tutor.' }, 500);
  }
});
