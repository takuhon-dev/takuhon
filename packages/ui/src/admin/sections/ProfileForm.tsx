import type { Address, Avatar, LocaleTag, Profile } from '@takuhon/core';

import { getAdminLabel } from '../admin-labels.js';
import { errorsAt, NO_FIELD_ERRORS, type FieldErrorIndex } from '../errors.js';
import { GravatarField } from '../primitives/GravatarField.js';
import { ImageField, type UploadAsset } from '../primitives/ImageField.js';
import { LocaleTabs } from '../primitives/LocaleTabs.js';
import { TextField } from '../primitives/TextField.js';

import styles from './sections.module.css';

export interface ProfileFormProps {
  value: Profile;
  onChange: (next: Profile) => void;
  locales: readonly LocaleTag[];
  errors?: FieldErrorIndex;
  formatLocale?: (locale: LocaleTag) => string;
  /**
   * Upload an avatar image file. When provided, the avatar field offers a file
   * picker; when omitted, it stays URL-only.
   */
  uploadAsset?: UploadAsset;
}

const POINTER = '/profile';

function isEmptyRecord(record: Record<string, string> | undefined): boolean {
  return !record || Object.keys(record).length === 0;
}

/**
 * Basic profile + About: display name, tagline, bio, avatar, and a structured
 * location (spec §6.5 / §14.2). The avatar accepts a URL and, when
 * `uploadAsset` is supplied by the host, an uploaded image file.
 */
export function ProfileForm({
  value,
  onChange,
  locales,
  errors = NO_FIELD_ERRORS,
  formatLocale,
  uploadAsset,
}: ProfileFormProps): React.JSX.Element {
  const updateAvatar = (patch: Partial<Avatar>): void => {
    const merged: Avatar = { url: '', ...value.avatar, ...patch };
    const keep = merged.url !== '' || !isEmptyRecord(merged.alt);
    onChange({ ...value, avatar: keep ? merged : undefined });
  };

  const updateLocation = (patch: Partial<Address>): void => {
    const merged: Address = { ...value.location, ...patch };
    const empty =
      !merged.country &&
      !merged.region &&
      isEmptyRecord(merged.locality) &&
      isEmptyRecord(merged.display);
    onChange({ ...value, location: empty ? undefined : merged });
  };

  const headingId = 'admin-section-profile';

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 className={styles.heading} id={headingId}>
        {getAdminLabel('section.profile')}
      </h2>

      <LocaleTabs
        label={getAdminLabel('field.displayName')}
        value={value.displayName}
        locales={locales}
        onChange={(next) => {
          onChange({ ...value, displayName: next ?? {} });
        }}
        required
        pointer={`${POINTER}/displayName`}
        errors={errors}
        formatLocale={formatLocale}
      />

      <LocaleTabs
        label={getAdminLabel('field.tagline')}
        value={value.tagline}
        locales={locales}
        onChange={(next) => {
          onChange({ ...value, tagline: next });
        }}
        pointer={`${POINTER}/tagline`}
        errors={errors}
        formatLocale={formatLocale}
      />

      <h3 className={styles.subheading}>{getAdminLabel('section.about')}</h3>
      <LocaleTabs
        label={getAdminLabel('field.bio')}
        value={value.bio}
        locales={locales}
        onChange={(next) => {
          onChange({ ...value, bio: next });
        }}
        multiline
        pointer={`${POINTER}/bio`}
        errors={errors}
        formatLocale={formatLocale}
      />

      <ImageField
        label={getAdminLabel('field.avatarUrl')}
        value={value.avatar?.url ?? ''}
        onChange={(url) => {
          updateAvatar({ url });
        }}
        hint={getAdminLabel(uploadAsset ? 'hint.avatarUpload' : 'hint.avatarNoUpload')}
        errors={errorsAt(errors, `${POINTER}/avatar/url`)}
        uploadAsset={uploadAsset}
      />
      <GravatarField
        onApply={(url) => {
          updateAvatar({ url });
        }}
      />
      <LocaleTabs
        label={getAdminLabel('field.avatarAlt')}
        value={value.avatar?.alt}
        locales={locales}
        onChange={(next) => {
          updateAvatar({ alt: next });
        }}
        pointer={`${POINTER}/avatar/alt`}
        errors={errors}
        formatLocale={formatLocale}
      />

      <TextField
        label={getAdminLabel('field.location.country')}
        value={value.location?.country ?? ''}
        onChange={(country) => {
          updateLocation({ country: country || undefined });
        }}
        hint={getAdminLabel('hint.country')}
        errors={errorsAt(errors, `${POINTER}/location/country`)}
      />
      <TextField
        label={getAdminLabel('field.location.region')}
        value={value.location?.region ?? ''}
        onChange={(region) => {
          updateLocation({ region: region || undefined });
        }}
        errors={errorsAt(errors, `${POINTER}/location/region`)}
      />
      <LocaleTabs
        label={getAdminLabel('field.location.locality')}
        value={value.location?.locality}
        locales={locales}
        onChange={(next) => {
          updateLocation({ locality: next });
        }}
        pointer={`${POINTER}/location/locality`}
        errors={errors}
        formatLocale={formatLocale}
      />
    </section>
  );
}
