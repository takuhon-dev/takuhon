import type { Career, LocaleTag } from '@takuhon/core';

import { getAdminLabel } from '../admin-labels.js';
import { NO_FIELD_ERRORS, errorsAt, type FieldErrorIndex } from '../errors.js';
import { makeId } from '../ids.js';
import { firstLocalized } from '../localized.js';
import { CheckboxField } from '../primitives/CheckboxField.js';
import { LocaleTabs } from '../primitives/LocaleTabs.js';
import { Repeater } from '../primitives/Repeater.js';
import { TextField } from '../primitives/TextField.js';

export interface CareersFormProps {
  value: readonly Career[];
  onChange: (next: Career[]) => void;
  locales: readonly LocaleTag[];
  errors?: FieldErrorIndex;
  formatLocale?: (locale: LocaleTag) => string;
}

/** Work experience (spec §6.7 / §14.2 "職歴"). */
export function CareersForm({
  value,
  onChange,
  locales,
  errors = NO_FIELD_ERRORS,
  formatLocale,
}: CareersFormProps): React.JSX.Element {
  return (
    <Repeater<Career>
      legend={getAdminLabel('section.careers')}
      items={value}
      onChange={onChange}
      keyOf={(career) => career.id}
      itemLabel={(career, index) =>
        firstLocalized(career.organization, locales) ||
        `${getAdminLabel('item.career')} ${String(index + 1)}`
      }
      createItem={() => ({
        id: makeId(
          'career',
          value.map((c) => c.id),
        ),
        organization: {},
        role: {},
        startDate: '',
      })}
      addLabel={getAdminLabel('action.add')}
      removeLabel={getAdminLabel('action.remove')}
      moveUpLabel={getAdminLabel('action.moveUp')}
      moveDownLabel={getAdminLabel('action.moveDown')}
      emptyHint={getAdminLabel('empty.careers')}
      renderItem={(career, update, index) => {
        const at = `/careers/${String(index)}`;
        return (
          <>
            <LocaleTabs
              label={getAdminLabel('field.career.organization')}
              value={career.organization}
              locales={locales}
              onChange={(next) => {
                update({ ...career, organization: next ?? {} });
              }}
              required
              pointer={`${at}/organization`}
              errors={errors}
              formatLocale={formatLocale}
            />
            <LocaleTabs
              label={getAdminLabel('field.career.role')}
              value={career.role}
              locales={locales}
              onChange={(next) => {
                update({ ...career, role: next ?? {} });
              }}
              required
              pointer={`${at}/role`}
              errors={errors}
              formatLocale={formatLocale}
            />
            <TextField
              label={getAdminLabel('field.career.startDate')}
              type="month"
              value={career.startDate}
              onChange={(startDate) => {
                update({ ...career, startDate });
              }}
              required
              hint={getAdminLabel('hint.month')}
              errors={errorsAt(errors, `${at}/startDate`)}
            />
            <TextField
              label={getAdminLabel('field.career.endDate')}
              type="month"
              value={career.endDate ?? ''}
              onChange={(endDate) => {
                update({ ...career, endDate: endDate || undefined });
              }}
              hint={getAdminLabel('hint.month')}
              errors={errorsAt(errors, `${at}/endDate`)}
            />
            <CheckboxField
              label={getAdminLabel('field.career.isCurrent')}
              checked={career.isCurrent ?? false}
              onChange={(isCurrent) => {
                update({ ...career, isCurrent: isCurrent || undefined });
              }}
            />
            <LocaleTabs
              label={getAdminLabel('field.career.description')}
              value={career.description}
              locales={locales}
              onChange={(next) => {
                update({ ...career, description: next });
              }}
              multiline
              pointer={`${at}/description`}
              errors={errors}
              formatLocale={formatLocale}
            />
            <TextField
              label={getAdminLabel('field.career.url')}
              type="url"
              value={career.url ?? ''}
              onChange={(url) => {
                update({ ...career, url: url || undefined });
              }}
              errors={errorsAt(errors, `${at}/url`)}
            />
          </>
        );
      }}
    />
  );
}
