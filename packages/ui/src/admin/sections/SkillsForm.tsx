import type { Skill } from '@takuhon/core';

import { getAdminLabel } from '../admin-labels.js';
import { NO_FIELD_ERRORS, errorsAt, type FieldErrorIndex } from '../errors.js';
import { makeId } from '../ids.js';
import { Repeater } from '../primitives/Repeater.js';
import { TextField } from '../primitives/TextField.js';

export interface SkillsFormProps {
  value: readonly Skill[];
  onChange: (next: Skill[]) => void;
  errors?: FieldErrorIndex;
}

/** Skills (spec §6.9 / §14.2). `label` is a plain string, not localized. */
export function SkillsForm({
  value,
  onChange,
  errors = NO_FIELD_ERRORS,
}: SkillsFormProps): React.JSX.Element {
  return (
    <Repeater<Skill>
      legend={getAdminLabel('section.skills')}
      items={value}
      onChange={onChange}
      keyOf={(skill) => skill.id}
      itemLabel={(skill, index) =>
        skill.label || `${getAdminLabel('item.skill')} ${String(index + 1)}`
      }
      createItem={() => ({
        id: makeId(
          'skill',
          value.map((s) => s.id),
        ),
        label: '',
      })}
      addLabel={getAdminLabel('action.add')}
      removeLabel={getAdminLabel('action.remove')}
      moveUpLabel={getAdminLabel('action.moveUp')}
      moveDownLabel={getAdminLabel('action.moveDown')}
      emptyHint={getAdminLabel('empty.skills')}
      renderItem={(skill, update, index) => {
        const at = `/skills/${String(index)}`;
        return (
          <>
            <TextField
              label={getAdminLabel('field.skill.label')}
              value={skill.label}
              onChange={(label) => {
                update({ ...skill, label });
              }}
              required
              errors={errorsAt(errors, `${at}/label`)}
            />
            <TextField
              label={getAdminLabel('field.skill.category')}
              value={skill.category ?? ''}
              onChange={(category) => {
                update({ ...skill, category: category || undefined });
              }}
              errors={errorsAt(errors, `${at}/category`)}
            />
          </>
        );
      }}
    />
  );
}
