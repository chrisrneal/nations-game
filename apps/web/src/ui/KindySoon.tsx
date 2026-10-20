import type { ReactElement } from 'react';
import type { ProfileView } from '@snacks/contracts';
import { Avatar } from './Avatar.tsx';

/**
 * A Kindy profile before Kindy mode is on screen (build step 10): a picture
 * that says "coming soon" without words (Kindy has no text in play), and a
 * big button back to the pictures.
 */
export function KindySoon(props: { profile: ProfileView; onBack: () => void }): ReactElement {
  return (
    <section className="kindy-soon" aria-label="Kindy mode is coming soon">
      <Avatar id={props.profile.avatar} size={120} />
      <p className="kindy-soon-art" aria-hidden="true">
        <span>🍎</span>
        <span>🚧</span>
        <span>🍌</span>
      </p>
      <p className="kindy-soon-wait" aria-hidden="true">
        ⏳
      </p>
      <button type="button" className="btn kindy-back" aria-label="Back to the pictures" onClick={props.onBack}>
        <span aria-hidden="true">👈 👥</span>
      </button>
    </section>
  );
}
