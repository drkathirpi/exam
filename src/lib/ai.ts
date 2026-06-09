import { supabase } from './supabase';

export type TutorFeature =
  | 'explain'
  | 'simplify'
  | 'memory'
  | 'similar'
  | 'topic_summary'
  | 'revision';

export interface TutorContext {
  question?: string;
  options?: string[];
  answer?: string;
  topic?: string;
  explanation?: string;
}

export interface AiStatus {
  enabled: boolean;
  keyPresent: boolean;
  model: string;
}

export async function askTutor(feature: TutorFeature, context: TutorContext): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { feature, context },
  });
  if (error) {
    let message = 'The tutor is unavailable right now.';
    try {
      const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep generic */
    }
    throw new Error(message);
  }
  const text = (data as { text?: string })?.text;
  if (!text) throw new Error('No response was generated.');
  return text;
}

export async function getAiStatus(): Promise<AiStatus> {
  const [settings, present] = await Promise.all([
    supabase.from('ai_settings').select('ai_enabled, gemini_model').eq('id', 1).single(),
    supabase.rpc('ai_key_present'),
  ]);
  return {
    enabled: Boolean(settings.data?.ai_enabled),
    model: (settings.data?.gemini_model as string) ?? 'gemini-2.0-flash',
    keyPresent: Boolean(present.data),
  };
}

export async function updateAiSettings(opts: { ai_enabled: boolean; gemini_model: string }): Promise<void> {
  const { error } = await supabase
    .from('ai_settings')
    .update({ ai_enabled: opts.ai_enabled, gemini_model: opts.gemini_model, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error('Could not save AI settings.');
}

export async function setAiKey(key: string): Promise<void> {
  const { error } = await supabase.rpc('set_ai_key', { p_key: key });
  if (error) throw new Error('Could not save the API key.');
}
