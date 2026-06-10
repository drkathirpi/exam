import { supabase } from './supabase';
import type { AppRole } from '@/types/database';
import type { ParsedBank } from './validation';

export interface NewUserInput {
  email: string;
  password: string;
  role?: AppRole;
  display_name?: string;
  username?: string;
  is_guest?: boolean;
}

interface InvokeError {
  context?: { json?: () => Promise<{ error?: string }> };
}

// Calls the privileged Edge Function. Extracts the server's friendly message
// when present; never surfaces a raw stack/internal error.
async function callAdminUsers<T>(action: string, payload: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { action, payload },
  });
  if (error) {
    let message = 'That action could not be completed. Please try again.';
    try {
      const body = await (error as InvokeError).context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return data as T;
}

export const adminApi = {
  createUser: (u: NewUserInput) => callAdminUsers<{ id: string; role: AppRole }>('create', u),

  bulkCreate: (users: NewUserInput[]) =>
    callAdminUsers<{ created: number; results: { email: string; ok: boolean; error?: string }[] }>(
      'bulk_create',
      { users },
    ),

  resetPassword: (user_id: string, new_password: string) =>
    callAdminUsers<{ ok: true }>('reset_password', { user_id, new_password }),

  setDisabled: (user_id: string, disabled: boolean) =>
    callAdminUsers<{ ok: true }>('set_disabled', { user_id, disabled }),

  deleteUser: (user_id: string) => callAdminUsers<{ ok: true }>('delete', { user_id }),
};

// Maps known DB constraint failures to readable text.
function friendlyImportError(message: string): string {
  if (message.includes('options_valid'))
    return 'A question has an invalid options array or answer index.';
  if (message.includes('questions_bank_id_external_id_key') || message.includes('duplicate key'))
    return 'Duplicate question id within the bank.';
  if (message.includes('not_blank')) return 'A question is missing required text.';
  return 'The import was rejected. Please re-check the file and try again.';
}

export async function importBank(bank: ParsedBank): Promise<string> {
  const { data, error } = await supabase.rpc('import_question_bank', {
    p_name: bank.name,
    p_description: bank.description,
    p_questions: bank.questions,
  });
  if (error) throw new Error(friendlyImportError(error.message));
  return data as string;
}

// Guest credential generation (browser crypto; no ambiguous chars).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function generateGuestCredentials(): { username: string; password: string; email: string } {
  const tag = randomString(6).toLowerCase();
  const username = `guest-${tag}`;
  return {
    username,
    password: randomString(12),
    email: `${username}@guest.example`,
  };
}
