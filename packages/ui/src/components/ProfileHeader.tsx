import type { LocalizedProfile } from '@takuhon/core';

import styles from './ProfileHeader.module.css';

export interface ProfileHeaderProps {
  profile: LocalizedProfile;
}

export function ProfileHeader({ profile }: ProfileHeaderProps): React.JSX.Element {
  const locationLabel = profile.location?.display ?? profile.location?.locality;

  return (
    <header className={styles.header}>
      {profile.avatar ? (
        <img
          className={styles.avatar}
          src={profile.avatar.url}
          alt={profile.avatar.alt ?? ''}
          width={128}
          height={128}
          loading="eager"
          decoding="async"
        />
      ) : null}
      <h1 className={styles.displayName}>{profile.displayName}</h1>
      {profile.tagline ? <p className={styles.tagline}>{profile.tagline}</p> : null}
      {locationLabel ? <p className={styles.location}>{locationLabel}</p> : null}
      {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
    </header>
  );
}
