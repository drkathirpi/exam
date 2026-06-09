import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/useAuth';
import { adminApi, generateGuestCredentials } from '@/lib/adminApi';
import type { NewUserInput } from '@/lib/adminApi';
import { parseCsv, toCsv, downloadText } from '@/lib/csv';
import type { AppRole, UserRow } from '@/types/database';
import { Button, Field, Input, RoleBadge, Spinner } from '@/components/ui';
import { Card, EmptyState, Modal, Select } from '@/components/ui-extras';

async function fetchUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name, username, is_guest, disabled, created_at, created_by')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

type Guest = { username: string; password: string };

export function UsersPage() {
  const { role: callerRole } = useAuth();
  const qc = useQueryClient();
  const canMakeStaff = callerRole === 'super_admin';

  const { data: users, isLoading, isError, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const [modal, setModal] = useState<null | 'create' | 'import' | 'reset'>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  const notifyOk = (text: string) => setBanner({ kind: 'ok', text });
  const notifyErr = (text: string) => setBanner({ kind: 'err', text });

  const generateGuest = useMutation({
    mutationFn: async () => {
      const c = generateGuestCredentials();
      await adminApi.createUser({
        email: c.email,
        password: c.password,
        username: c.username,
        role: 'student',
        is_guest: true,
      });
      return c;
    },
    onSuccess: (c) => {
      setGuests((g) => [{ username: c.username, password: c.password }, ...g]);
      notifyOk(`Guest ${c.username} created.`);
      invalidate();
    },
    onError: (e: Error) => notifyErr(e.message),
  });

  const setDisabled = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      adminApi.setDisabled(id, disabled),
    onSuccess: () => {
      notifyOk('User updated.');
      invalidate();
    },
    onError: (e: Error) => notifyErr(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      notifyOk('User deleted.');
      invalidate();
    },
    onError: (e: Error) => notifyErr(e.message),
  });

  const exportGuests = () => {
    const rows = [['username', 'password'], ...guests.map((g) => [g.username, g.password])];
    downloadText('guest-credentials.csv', toCsv(rows));
  };

  const downloadTemplate = () =>
    downloadText(
      'users-template.csv',
      toCsv([
        ['email', 'password', 'display_name', 'username', 'role', 'is_guest'],
        ['student1@example.com', 'changeme123', 'Student One', 'student1', 'student', 'false'],
      ]),
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Users</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModal('create')}>Add user</Button>
          <Button variant="ghost" onClick={() => generateGuest.mutate()} disabled={generateGuest.isPending}>
            {generateGuest.isPending ? 'Generating…' : 'Generate guest'}
          </Button>
          <Button variant="ghost" onClick={() => setModal('import')}>
            Import CSV
          </Button>
        </div>
      </div>

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

      {guests.length > 0 ? (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">New guest credentials (this session)</h2>
            <Button variant="ghost" onClick={exportGuests}>
              Export CSV
            </Button>
          </div>
          <ul className="space-y-1 font-mono text-sm">
            {guests.map((g) => (
              <li key={g.username} className="flex items-center justify-between gap-3">
                <span className="text-body">
                  {g.username} · {g.password}
                </span>
                <button
                  className="text-primary hover:underline"
                  onClick={() => void navigator.clipboard?.writeText(`${g.username}\t${g.password}`)}
                >
                  Copy
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="py-16">
          <Spinner label="Loading users" />
        </div>
      ) : isError || !users ? (
        <Card className="p-6">
          <p className="text-sm text-body">We couldn’t load users.</p>
          <Button className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      ) : users.length === 0 ? (
        <EmptyState title="No users yet" body="Add your first student, or generate a guest login." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-body">{u.display_name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-muted">{u.username ?? '—'}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    {u.disabled ? (
                      <span className="text-danger">Disabled</span>
                    ) : (
                      <span className="text-success">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        className="text-primary hover:underline"
                        onClick={() => {
                          setResetTarget(u);
                          setModal('reset');
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        className="text-body hover:underline"
                        onClick={() => setDisabled.mutate({ id: u.id, disabled: !u.disabled })}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                      <button
                        className="text-danger hover:underline"
                        onClick={() => {
                          if (confirm(`Delete ${u.username ?? u.display_name ?? 'this user'}? This cannot be undone.`))
                            deleteUser.mutate(u.id);
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

      <p className="text-xs text-muted">
        Need a CSV to start from?{' '}
        <button className="text-primary hover:underline" onClick={downloadTemplate}>
          Download the template
        </button>
        .
      </p>

      {modal === 'create' ? (
        <CreateUserModal
          canMakeStaff={canMakeStaff}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            notifyOk(msg);
            invalidate();
            setModal(null);
          }}
          onError={notifyErr}
        />
      ) : null}

      {modal === 'import' ? (
        <ImportUsersModal
          onClose={() => setModal(null)}
          onDone={(msg) => {
            notifyOk(msg);
            invalidate();
            setModal(null);
          }}
          onError={notifyErr}
        />
      ) : null}

      {modal === 'reset' && resetTarget ? (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            notifyOk(msg);
            setModal(null);
          }}
          onError={notifyErr}
        />
      ) : null}
    </div>
  );
}

function CreateUserModal({
  canMakeStaff,
  onClose,
  onDone,
  onError,
}: {
  canMakeStaff: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<AppRole>('student');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      onError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await adminApi.createUser({
        email: email.trim(),
        password,
        display_name: displayName.trim() || undefined,
        username: username.trim() || undefined,
        role,
      });
      onDone(`User ${email.trim()} created.`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" htmlFor="cu-email">
          <Input id="cu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Temporary password" htmlFor="cu-pw">
          <Input id="cu-pw" type="text" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Display name" htmlFor="cu-name">
            <Input id="cu-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Username" htmlFor="cu-user">
            <Input id="cu-user" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
        </div>
        <Field label="Role" htmlFor="cu-role">
          <Select id="cu-role" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            <option value="student">Student</option>
            {canMakeStaff ? <option value="admin">Admin</option> : null}
            {canMakeStaff ? <option value="super_admin">Super admin</option> : null}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportUsersModal({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [rows, setRows] = useState<NewUserInput[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [busy, setBusy] = useState(false);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCsv(String(reader.result ?? ''));
      const header = (grid[0] ?? []).map((h) => h.trim().toLowerCase());
      const col = (name: string) => header.indexOf(name);
      const parsed: NewUserInput[] = grid.slice(1).map((r) => ({
        email: (r[col('email')] ?? '').trim(),
        password: (r[col('password')] ?? '').trim(),
        display_name: (r[col('display_name')] ?? '').trim() || undefined,
        username: (r[col('username')] ?? '').trim() || undefined,
        role: ((r[col('role')] ?? 'student').trim() as AppRole) || 'student',
        is_guest: (r[col('is_guest')] ?? '').trim().toLowerCase() === 'true',
      }));
      setRows(parsed.filter((u) => u.email && u.password));
    };
    reader.readAsText(file);
  }

  const valid = useMemo(() => rows.length > 0, [rows]);

  async function run() {
    setBusy(true);
    try {
      const res = await adminApi.bulkCreate(rows);
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length > 0)
        onError(`Created ${res.created}. ${failed.length} failed (e.g. ${failed[0]?.email}).`);
      else onDone(`Created ${res.created} users.`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import users from CSV" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Columns: email, password, display_name, username, role, is_guest. Email and password are
          required.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        {fileName ? (
          <p className="text-sm text-body">
            {fileName}: {rows.length} valid row{rows.length === 1 ? '' : 's'} found.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!valid || busy} onClick={run}>
            {busy ? 'Importing…' : `Import ${rows.length || ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
  onError,
}: {
  user: UserRow;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      onError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await adminApi.resetPassword(user.id, password);
      onDone(`Password reset for ${user.username ?? user.display_name ?? 'user'}.`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Reset password" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          Set a new password for {user.username ?? user.display_name ?? 'this user'}.
        </p>
        <Field label="New password" htmlFor="rp-pw">
          <Input id="rp-pw" type="text" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Reset password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
