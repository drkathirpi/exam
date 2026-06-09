import { useEffect, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { validateBankFile } from '@/lib/validation';
import type { FileReport, ParsedBank, ParsedQuestion } from '@/lib/validation';
import { importBank } from '@/lib/adminApi';
import { downloadText } from '@/lib/csv';
import type { BankRow } from '@/types/database';
import { Button, Field, Input, Spinner } from '@/components/ui';
import { Card, EmptyState, Modal, Textarea } from '@/components/ui-extras';

interface BankWithCount extends BankRow {
  questionCount: number;
}

async function fetchBanks(): Promise<BankWithCount[]> {
  const { data, error } = await supabase
    .from('question_banks')
    .select('id, name, description, archived, created_at, questions(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b) => {
    const countField = (b.questions as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      archived: b.archived,
      created_at: b.created_at,
      questionCount: countField,
    };
  });
}

async function fetchBankAsParsed(bankId: string, name: string): Promise<ParsedBank> {
  const { data, error } = await supabase
    .from('questions')
    .select('external_id, topic, exam, question_text, options, answer_index, source, explanation')
    .eq('bank_id', bankId)
    .order('external_id', { ascending: true });
  if (error) throw error;
  const questions: ParsedQuestion[] = (data ?? []).map((q) => ({
    id: q.external_id,
    topic: q.topic,
    exam: q.exam,
    q: q.question_text,
    opts: q.options as string[],
    answer: q.answer_index,
    source: q.source,
    explanation: q.explanation,
  }));
  return { name, description: null, questions };
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsText(file);
  });
}

export function BanksPage() {
  const qc = useQueryClient();
  const { data: banks, isLoading, isError, refetch } = useQuery({
    queryKey: ['banks'],
    queryFn: fetchBanks,
  });

  const [reports, setReports] = useState<FileReport[]>([]);
  const [dragging, setDragging] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [editing, setEditing] = useState<BankWithCount | null>(null);
  const [assignTarget, setAssignTarget] = useState<BankWithCount | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['banks'] });
  const notifyOk = (text: string) => setBanner({ kind: 'ok', text });
  const notifyErr = (text: string) => setBanner({ kind: 'err', text });

  async function ingestFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.name.endsWith('.json'));
    if (list.length === 0) {
      notifyErr('Please drop one or more .json files.');
      return;
    }
    const next: FileReport[] = [];
    for (const f of list) {
      try {
        next.push(validateBankFile(f.name, await readText(f)));
      } catch {
        next.push({
          fileName: f.name,
          ok: false,
          bankName: null,
          questionCount: 0,
          fileErrors: ['The file could not be read.'],
          questionIssues: [],
        });
      }
    }
    setReports(next);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void ingestFiles(e.dataTransfer.files);
  }

  const importValid = useMutation({
    mutationFn: async () => {
      const valid = reports.filter((r) => r.ok && r.parsed);
      let imported = 0;
      for (const r of valid) {
        await importBank(r.parsed as ParsedBank);
        imported++;
      }
      return imported;
    },
    onSuccess: (n) => {
      notifyOk(`Imported ${n} bank${n === 1 ? '' : 's'}.`);
      setReports([]);
      invalidate();
    },
    onError: (e: Error) => notifyErr(e.message),
  });

  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('question_banks').update({ archived }).eq('id', id);
      if (error) throw new Error('Could not update the bank.');
    },
    onSuccess: () => {
      notifyOk('Bank updated.');
      invalidate();
    },
    onError: (e: Error) => notifyErr(e.message),
  });

  const removeBank = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('question_banks').delete().eq('id', id);
      if (error) throw new Error('Could not delete the bank.');
    },
    onSuccess: () => {
      notifyOk('Bank deleted.');
      invalidate();
    },
    onError: (e: Error) => notifyErr(e.message),
  });

  const duplicateBank = useMutation({
    mutationFn: async (b: BankWithCount) => {
      const parsed = await fetchBankAsParsed(b.id, `${b.name} (copy)`);
      await importBank(parsed);
    },
    onSuccess: () => {
      notifyOk('Bank duplicated.');
      invalidate();
    },
    onError: (e: Error) => notifyErr(e.message),
  });

  async function exportBank(b: BankWithCount) {
    try {
      const parsed = await fetchBankAsParsed(b.id, b.name);
      const payload = {
        name: parsed.name,
        questions: parsed.questions.map((q) => ({
          id: q.id,
          topic: q.topic,
          exam: q.exam,
          q: q.q,
          opts: q.opts,
          answer: q.answer,
          source: q.source ?? undefined,
          explanation: q.explanation,
        })),
      };
      downloadText(`${b.name.replace(/\s+/g, '-').toLowerCase()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    } catch {
      notifyErr('Could not export the bank.');
    }
  }

  const validCount = reports.filter((r) => r.ok).length;
  const hasReports = reports.length > 0;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-ink">Question banks</h1>

      {banner ? (
        <div
          className={`rounded-lg px-3.5 py-2.5 text-sm ${
            banner.kind === 'ok'
              ? 'bg-success/10 text-success'
              : 'border border-danger/30 bg-danger/5 text-danger'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {/* Upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
        }`}
      >
        <p className="text-sm font-medium text-ink">Drag & drop bank .json files here</p>
        <p className="mt-1 text-xs text-muted">One or many. Nothing is imported until it passes validation.</p>
        <label className="mt-3 inline-block cursor-pointer text-sm text-primary hover:underline">
          or choose files
          <input
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && void ingestFiles(e.target.files)}
          />
        </label>
      </div>

      {/* Validation report */}
      {hasReports ? (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Validation report</h2>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setReports([])}>
                Clear
              </Button>
              <Button
                disabled={validCount === 0 || importValid.isPending}
                onClick={() => importValid.mutate()}
              >
                {importValid.isPending ? 'Importing…' : `Import ${validCount} valid`}
              </Button>
            </div>
          </div>
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.fileName} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-body">{r.fileName}</span>
                  <span className={r.ok ? 'text-sm text-success' : 'text-sm text-danger'}>
                    {r.ok ? `Valid · ${r.questionCount} questions` : 'Has errors'}
                  </span>
                </div>
                {r.fileErrors.length > 0 || r.questionIssues.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-danger">
                    {r.fileErrors.map((m, i) => (
                      <li key={`f${i}`}>• {m}</li>
                    ))}
                    {r.questionIssues.slice(0, 50).map((q, i) => (
                      <li key={`q${i}`}>
                        • Q{q.position}
                        {q.id !== undefined ? ` (id ${q.id})` : ''}: {q.message}
                      </li>
                    ))}
                    {r.questionIssues.length > 50 ? (
                      <li>• …and {r.questionIssues.length - 50} more.</li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Bank list */}
      {isLoading ? (
        <div className="py-16">
          <Spinner label="Loading banks" />
        </div>
      ) : isError || !banks ? (
        <Card className="p-6">
          <p className="text-sm text-body">We couldn’t load question banks.</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      ) : banks.length === 0 ? (
        <EmptyState title="No question banks yet" body="Upload a .json file above to create your first bank." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Questions</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-body">
                    {b.name}
                    {b.description ? <p className="text-xs text-muted">{b.description}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-muted">{b.questionCount}</td>
                  <td className="px-4 py-3">
                    {b.archived ? (
                      <span className="text-warning">Archived</span>
                    ) : (
                      <span className="text-success">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-3 text-xs">
                      <button className="text-primary hover:underline" onClick={() => setEditing(b)}>
                        Edit
                      </button>
                      <button
                        className="text-primary hover:underline"
                        onClick={() => setAssignTarget(b)}
                      >
                        Assign
                      </button>
                      <button className="text-body hover:underline" onClick={() => void exportBank(b)}>
                        Export
                      </button>
                      <button
                        className="text-body hover:underline"
                        onClick={() => setArchived.mutate({ id: b.id, archived: !b.archived })}
                      >
                        {b.archived ? 'Unarchive' : 'Archive'}
                      </button>
                      <button className="text-body hover:underline" onClick={() => duplicateBank.mutate(b)}>
                        Duplicate
                      </button>
                      <button
                        className="text-danger hover:underline"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete "${b.name}"? This permanently removes its ${b.questionCount} questions and any attempt history tied to them. Consider Archive instead.`,
                            )
                          )
                            removeBank.mutate(b.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing ? (
        <EditBankModal
          bank={editing}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            notifyOk(msg);
            invalidate();
            setEditing(null);
          }}
          onError={notifyErr}
        />
      ) : null}

      {assignTarget ? (
        <AssignModal
          bank={assignTarget}
          onClose={() => setAssignTarget(null)}
          onError={notifyErr}
          onDone={(msg) => {
            notifyOk(msg);
            setAssignTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EditBankModal({
  bank,
  onClose,
  onDone,
  onError,
}: {
  bank: BankWithCount;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(bank.name);
  const [description, setDescription] = useState(bank.description ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length === 0) {
      onError('Name is required.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('question_banks')
      .update({ name: name.trim(), description: description.trim() || null })
      .eq('id', bank.id);
    setBusy(false);
    if (error) onError('Could not save changes.');
    else onDone('Bank updated.');
  }

  return (
    <Modal title="Edit bank" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="eb-name">
          <Input id="eb-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description" htmlFor="eb-desc">
          <Textarea id="eb-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignModal({
  bank,
  onClose,
  onDone,
  onError,
}: {
  bank: BankWithCount;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['assign', bank.id],
    queryFn: async () => {
      const [studentsRes, asgRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name, username').eq('role', 'student'),
        supabase.from('assignments').select('user_id').eq('bank_id', bank.id),
      ]);
      if (studentsRes.error) throw studentsRes.error;
      if (asgRes.error) throw asgRes.error;
      return {
        students: (studentsRes.data ?? []).map((s) => ({
          id: s.id as string,
          name: (s.display_name as string) || (s.username as string) || 'Student',
        })),
        assigned: new Set((asgRes.data ?? []).map((a) => a.user_id as string)),
      };
    },
  });

  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (data && !ready) {
      setAssigned(new Set(data.assigned));
      setReady(true);
    }
  }, [data, ready]);

  async function toggle(userId: string, on: boolean) {
    setAssigned((prev) => {
      const n = new Set(prev);
      if (on) n.add(userId);
      else n.delete(userId);
      return n;
    });
    try {
      if (on) {
        const { error } = await supabase
          .from('assignments')
          .insert({ bank_id: bank.id, user_id: userId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('assignments')
          .delete()
          .eq('bank_id', bank.id)
          .eq('user_id', userId);
        if (error) throw error;
      }
    } catch {
      setAssigned((prev) => {
        const n = new Set(prev);
        if (on) n.delete(userId);
        else n.add(userId);
        return n;
      });
      onError('Could not update that assignment.');
    }
  }

  return (
    <Modal title={`Assign “${bank.name}”`} onClose={onClose}>
      {isLoading ? (
        <Spinner label="Loading students" />
      ) : !data || data.students.length === 0 ? (
        <p className="text-sm text-muted">No students to assign yet.</p>
      ) : (
        <ul className="space-y-1">
          {data.students.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-canvas">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0F7C86]"
                  checked={assigned.has(s.id)}
                  onChange={(e) => void toggle(s.id, e.target.checked)}
                />
                <span className="text-sm text-body">{s.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end">
        <Button onClick={() => onDone('Assignments updated.')}>Done</Button>
      </div>
    </Modal>
  );
}
