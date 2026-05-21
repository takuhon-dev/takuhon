import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import exampleJson from '../../../../../examples/personal-profile/takuhon.json' with { type: 'json' };
import { SkillsList } from '../SkillsList.js';

const skills = exampleJson.skills;

describe('SkillsList', () => {
  it('renders a labelled Skills section', () => {
    render(<SkillsList skills={skills} />);
    expect(screen.getByRole('region', { name: /skills/i })).toBeInTheDocument();
  });

  it('groups skills by category', () => {
    render(<SkillsList skills={skills} />);
    const programmingList = screen.getByRole('list', { name: /programming skills/i });
    const designList = screen.getByRole('list', { name: /design skills/i });
    const languageList = screen.getByRole('list', { name: /language skills/i });
    expect(programmingList).toBeInTheDocument();
    expect(designList).toBeInTheDocument();
    expect(languageList).toBeInTheDocument();
  });

  it('falls back to "other" group when category is missing', () => {
    render(
      <SkillsList
        skills={[
          { id: 'curiosity', label: 'Curiosity' },
          { id: 'patience', label: 'Patience' },
        ]}
      />,
    );
    expect(screen.getByRole('list', { name: /other skills/i })).toBeInTheDocument();
  });

  it('renders each category label as a level-3 heading', () => {
    render(<SkillsList skills={skills} />);
    const categoryHeadings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(categoryHeadings).toEqual(expect.arrayContaining(['programming', 'design', 'language']));
  });

  it('returns nothing when given an empty list', () => {
    const { container } = render(<SkillsList skills={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
