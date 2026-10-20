import { useState, type ReactElement } from 'react';
import type { AvatarId, HomeView, Mode, ProfileView } from '@snacks/contracts';
import type { GameHost } from '../platform/index.ts';
import { Avatar } from './Avatar.tsx';
import { AVATAR_LOOK, profileLabel, streakText } from './people.ts';
import { Sheet } from './Sheet.tsx';

type Page = { readonly kind: 'list' } | { readonly kind: 'add' } | { readonly kind: 'edit'; readonly id: string } | { readonly kind: 'delete'; readonly id: string };

const MODE_WORDS: Readonly<Record<Mode, string>> = { main: 'Main: reads clue cards', kindy: 'Kindy: pictures only' };

/**
 * The grown-ups' menu (RULES 12, D17), opened by a press-and-hold on the
 * picker: add a child, change a picture or name, delete a profile after a
 * confirm step. The mode is chosen once, when the profile is made.
 */
export function ParentMenu(props: { home: HomeView; host: GameHost; onToast: (text: string) => void; onClose: () => void }): ReactElement {
  const { home, host, onToast, onClose } = props;
  const [page, setPage] = useState<Page>({ kind: 'list' });
  const back = (): void => setPage({ kind: 'list' });
  const done = (error: string | null): void => {
    if (error === null) back();
    else onToast(error);
  };
  const find = (id: string): ProfileView | undefined => home.profiles.find((p) => p.id === id);

  if (page.kind === 'add') {
    const free = home.avatars.find((a) => !home.profiles.some((p) => p.avatar === a)) ?? home.avatars[0]!;
    return <ProfileForm home={home} title="Add a child" start={{ name: '', avatar: free, mode: 'main' }} withMode onCancel={back} onSave={(draft) => void host.addProfile(draft).then(done)} />;
  }
  if (page.kind === 'edit') {
    const p = find(page.id);
    if (p === undefined) {
      // That profile is gone: back to the list.
      setPage({ kind: 'list' });
      return <></>;
    }
    return (
      <ProfileForm
        home={home}
        title={`Change ${profileLabel(p)}`}
        self={p.id}
        start={{ name: p.name, avatar: p.avatar, mode: p.mode }}
        withMode={false}
        onCancel={back}
        onSave={(draft) => void host.editProfile(p.id, { name: draft.name, avatar: draft.avatar }).then(done)}
      />
    );
  }
  if (page.kind === 'delete') {
    const p = find(page.id);
    if (p === undefined) {
      // That profile is gone: back to the list.
      setPage({ kind: 'list' });
      return <></>;
    }
    return (
      <Sheet title={`Delete ${profileLabel(p)}?`} onClose={back}>
        <div className="parent-who">
          <Avatar id={p.avatar} size={56} />
          <p className="sheet-note">
            {profileLabel(p)}’s streak ({streakText(p.streak)}), finished days and saved games on this phone are deleted too. This can’t be undone.
          </p>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-danger btn-wide" onClick={() => void host.deleteProfile(p.id).then(done)}>
            Yes, delete {profileLabel(p)}
          </button>
          <button type="button" className="btn btn-wide" onClick={back}>
            Keep {profileLabel(p)}
          </button>
        </div>
      </Sheet>
    );
  }

  const last = home.profiles.length === 1;
  return (
    <Sheet title="Grown-ups" onClose={onClose}>
      <ul className="parent-list" aria-label="Profiles">
        {home.profiles.map((p) => (
          <li key={p.id}>
            <Avatar id={p.avatar} size={44} />
            <span className="parent-what">
              <strong>{p.name === '' ? 'No name' : p.name}</strong>
              <span className="muted small">{p.mode === 'main' ? 'Main' : 'Kindy'} · 🔥 {streakText(p.streak)}</span>
            </span>
            <button type="button" className="btn btn-small" aria-label={`Change ${profileLabel(p)}`} onClick={() => setPage({ kind: 'edit', id: p.id })}>
              Change
            </button>
            <button type="button" className="btn btn-small" aria-label={`Delete ${profileLabel(p)}`} disabled={last} onClick={() => setPage({ kind: 'delete', id: p.id })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {last && <p className="sheet-note muted small">The last profile can’t be deleted. Add another one first.</p>}
      <div className="sheet-actions">
        <button type="button" className="btn btn-primary btn-wide" onClick={() => setPage({ kind: 'add' })}>
          ＋ Add a child
        </button>
      </div>
    </Sheet>
  );
}

/** Picking a picture nobody else has, an optional name and (for a new profile) the mode. */
function ProfileForm(props: {
  home: HomeView;
  title: string;
  self?: string;
  start: { name: string; avatar: AvatarId; mode: Mode };
  withMode: boolean;
  onCancel: () => void;
  onSave: (draft: { name: string; avatar: AvatarId; mode: Mode }) => void;
}): ReactElement {
  const { home } = props;
  const [name, setName] = useState(props.start.name);
  const [avatar, setAvatar] = useState(props.start.avatar);
  const [mode, setMode] = useState(props.start.mode);
  const taken = (a: AvatarId): boolean => home.profiles.some((p) => p.avatar === a && p.id !== props.self);
  return (
    <Sheet title={props.title} onClose={props.onCancel}>
      <form
        className="profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave({ name, avatar, mode });
        }}
      >
        <fieldset className="avatar-pick">
          <legend className="small muted">Picture</legend>
          {home.avatars.map((a) => (
            <button key={a} type="button" className={`avatar-choice${a === avatar ? ' on' : ''}`} aria-label={AVATAR_LOOK[a].name} aria-pressed={a === avatar} disabled={taken(a)} onClick={() => setAvatar(a)}>
              <Avatar id={a} size={48} />
            </button>
          ))}
        </fieldset>
        <label className="profile-name">
          <span className="small muted">Name (you can leave it empty)</span>
          <input type="text" value={name} autoComplete="off" enterKeyHint="done" onChange={(event) => setName(event.target.value)} />
        </label>
        {props.withMode && (
          <fieldset className="mode-pick">
            <legend className="small muted">Mode (can’t be changed later)</legend>
            {(['main', 'kindy'] as const).map((m) => (
              <button key={m} type="button" className={`btn mode-choice${m === mode ? ' on' : ''}`} aria-pressed={m === mode} onClick={() => setMode(m)}>
                {MODE_WORDS[m]}
              </button>
            ))}
          </fieldset>
        )}
        <div className="sheet-actions">
          <button type="submit" className="btn btn-primary btn-wide">
            Save
          </button>
          <button type="button" className="btn btn-wide" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
