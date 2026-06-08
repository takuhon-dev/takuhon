import type { LocaleTag, Project } from '@takuhon/core';

import { getAdminLabel } from '../admin-labels.js';
import { NO_FIELD_ERRORS, collectErrorsUnder, errorsAt, type FieldErrorIndex } from '../errors.js';
import { makeId } from '../ids.js';
import { firstLocalized } from '../localized.js';
import { CheckboxField } from '../primitives/CheckboxField.js';
import { LocaleTabs } from '../primitives/LocaleTabs.js';
import { Repeater } from '../primitives/Repeater.js';
import { TextField } from '../primitives/TextField.js';

export interface ProjectsFormProps {
  value: readonly Project[];
  onChange: (next: Project[]) => void;
  locales: readonly LocaleTag[];
  errors?: FieldErrorIndex;
  formatLocale?: (locale: LocaleTag) => string;
}

function parseTags(input: string): string[] | undefined {
  const tags = input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
  return tags.length > 0 ? tags : undefined;
}

/** Projects (spec §6.8 / §14.2). */
export function ProjectsForm({
  value,
  onChange,
  locales,
  errors = NO_FIELD_ERRORS,
  formatLocale,
}: ProjectsFormProps): React.JSX.Element {
  return (
    <Repeater<Project>
      legend={getAdminLabel('section.projects')}
      items={value}
      onChange={onChange}
      keyOf={(project) => project.id}
      itemLabel={(project, index) =>
        firstLocalized(project.title, locales) ||
        `${getAdminLabel('item.project')} ${String(index + 1)}`
      }
      createItem={() => ({
        id: makeId(
          'project',
          value.map((p) => p.id),
        ),
        title: {},
      })}
      addLabel={getAdminLabel('action.add')}
      removeLabel={getAdminLabel('action.remove')}
      moveUpLabel={getAdminLabel('action.moveUp')}
      moveDownLabel={getAdminLabel('action.moveDown')}
      emptyHint={getAdminLabel('empty.projects')}
      renderItem={(project, update, index) => {
        const at = `/projects/${String(index)}`;
        return (
          <>
            <LocaleTabs
              label={getAdminLabel('field.project.title')}
              value={project.title}
              locales={locales}
              onChange={(next) => {
                update({ ...project, title: next ?? {} });
              }}
              required
              pointer={`${at}/title`}
              errors={errors}
              formatLocale={formatLocale}
            />
            <LocaleTabs
              label={getAdminLabel('field.project.description')}
              value={project.description}
              locales={locales}
              onChange={(next) => {
                update({ ...project, description: next });
              }}
              multiline
              pointer={`${at}/description`}
              errors={errors}
              formatLocale={formatLocale}
            />
            <TextField
              label={getAdminLabel('field.project.url')}
              type="url"
              value={project.url ?? ''}
              onChange={(url) => {
                update({ ...project, url: url || undefined });
              }}
              errors={errorsAt(errors, `${at}/url`)}
            />
            <TextField
              label={getAdminLabel('field.project.tags')}
              value={(project.tags ?? []).join(', ')}
              onChange={(input) => {
                update({ ...project, tags: parseTags(input) });
              }}
              hint={getAdminLabel('hint.tags')}
              errors={collectErrorsUnder(errors, `${at}/tags`)}
            />
            <TextField
              label={getAdminLabel('field.project.startDate')}
              type="month"
              value={project.startDate ?? ''}
              onChange={(startDate) => {
                update({ ...project, startDate: startDate || undefined });
              }}
              hint={getAdminLabel('hint.month')}
              errors={errorsAt(errors, `${at}/startDate`)}
            />
            <TextField
              label={getAdminLabel('field.project.endDate')}
              type="month"
              value={project.endDate ?? ''}
              onChange={(endDate) => {
                update({ ...project, endDate: endDate || undefined });
              }}
              hint={getAdminLabel('hint.month')}
              errors={errorsAt(errors, `${at}/endDate`)}
            />
            <CheckboxField
              label={getAdminLabel('field.project.highlighted')}
              checked={project.highlighted ?? false}
              onChange={(highlighted) => {
                update({ ...project, highlighted: highlighted || undefined });
              }}
            />
          </>
        );
      }}
    />
  );
}
