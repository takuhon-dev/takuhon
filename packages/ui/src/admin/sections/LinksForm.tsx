import type { LinkBuiltin, LinkCustom, LinkType, Link, LocaleTag } from '@takuhon/core';

import { getAdminLabel } from '../admin-labels.js';
import { NO_FIELD_ERRORS, errorsAt, type FieldErrorIndex } from '../errors.js';
import { makeId } from '../ids.js';
import { CheckboxField } from '../primitives/CheckboxField.js';
import { LocaleTabs } from '../primitives/LocaleTabs.js';
import { Repeater } from '../primitives/Repeater.js';
import { SelectField } from '../primitives/SelectField.js';
import { TextField } from '../primitives/TextField.js';

export interface LinksFormProps {
  value: readonly Link[];
  onChange: (next: Link[]) => void;
  locales: readonly LocaleTag[];
  errors?: FieldErrorIndex;
  formatLocale?: (locale: LocaleTag) => string;
}

const LINK_TYPES: readonly LinkType[] = [
  'website',
  'blog',
  'github',
  'gitlab',
  'linkedin',
  'x',
  'mastodon',
  'bluesky',
  'instagram',
  'youtube',
  'threads',
  'facebook',
  'email',
  'rss',
  'custom',
];

/** Re-key a link to a new `type`, preserving common fields and the icon. */
function retypeLink(link: Link, type: LinkType): Link {
  if (type === 'custom') {
    return {
      id: link.id,
      url: link.url,
      label: link.label,
      featured: link.featured,
      order: link.order,
      type: 'custom',
      iconUrl: link.iconUrl ?? '',
    } satisfies LinkCustom;
  }
  const builtin: LinkBuiltin = {
    id: link.id,
    url: link.url,
    label: link.label,
    featured: link.featured,
    order: link.order,
    type,
  };
  if (link.iconUrl) builtin.iconUrl = link.iconUrl;
  return builtin;
}

/** Set the icon URL, keeping it required for custom links and optional otherwise. */
function setIconUrl(link: Link, iconUrl: string): Link {
  if (link.type === 'custom') return { ...link, iconUrl };
  return { ...link, iconUrl: iconUrl || undefined };
}

/** SNS / profile links with builtin-vs-custom typing (spec §6.6 / §14.2). */
export function LinksForm({
  value,
  onChange,
  locales,
  errors = NO_FIELD_ERRORS,
  formatLocale,
}: LinksFormProps): React.JSX.Element {
  return (
    <Repeater<Link>
      legend={getAdminLabel('section.links')}
      items={value}
      onChange={onChange}
      keyOf={(link) => link.id}
      itemLabel={(link, index) => link.url || `${getAdminLabel('item.link')} ${String(index + 1)}`}
      createItem={() => ({
        id: makeId(
          'link',
          value.map((l) => l.id),
        ),
        type: 'website',
        url: '',
      })}
      addLabel={getAdminLabel('action.add')}
      removeLabel={getAdminLabel('action.remove')}
      moveUpLabel={getAdminLabel('action.moveUp')}
      moveDownLabel={getAdminLabel('action.moveDown')}
      emptyHint={getAdminLabel('empty.links')}
      renderItem={(link, update, index) => {
        const at = `/links/${String(index)}`;
        return (
          <>
            <SelectField
              label={getAdminLabel('field.link.type')}
              value={link.type}
              options={LINK_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(t) => {
                update(retypeLink(link, t as LinkType));
              }}
              errors={errorsAt(errors, `${at}/type`)}
            />
            <TextField
              label={getAdminLabel('field.link.url')}
              type="url"
              value={link.url}
              onChange={(url) => {
                update({ ...link, url });
              }}
              required
              errors={errorsAt(errors, `${at}/url`)}
            />
            <LocaleTabs
              label={getAdminLabel('field.link.label')}
              value={link.label}
              locales={locales}
              onChange={(next) => {
                update({ ...link, label: next });
              }}
              pointer={`${at}/label`}
              errors={errors}
              formatLocale={formatLocale}
            />
            <TextField
              label={getAdminLabel('field.link.iconUrl')}
              type="url"
              value={link.iconUrl ?? ''}
              onChange={(iconUrl) => {
                update(setIconUrl(link, iconUrl));
              }}
              required={link.type === 'custom'}
              errors={errorsAt(errors, `${at}/iconUrl`)}
            />
            <CheckboxField
              label={getAdminLabel('field.link.featured')}
              checked={link.featured ?? false}
              onChange={(featured) => {
                update({ ...link, featured: featured || undefined });
              }}
            />
          </>
        );
      }}
    />
  );
}
