import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Repeater } from '../primitives/Repeater.js';
import { TextField } from '../primitives/TextField.js';

interface Item {
  id: string;
  name: string;
}

/** Stateful harness so add / remove / reorder interactions reflect in the DOM. */
function Harness({ initial }: { initial: Item[] }): React.JSX.Element {
  const [items, setItems] = useState<Item[]>(initial);
  return (
    <Repeater<Item>
      legend="Links"
      items={items}
      onChange={setItems}
      keyOf={(item) => item.id}
      itemLabel={(item, index) => item.name || `Item ${String(index + 1)}`}
      createItem={() => ({ id: `new-${String(items.length + 1)}`, name: '' })}
      emptyHint="No links yet."
      renderItem={(item, update) => (
        <TextField
          label="Name"
          value={item.name}
          onChange={(name) => {
            update({ ...item, name });
          }}
        />
      )}
    />
  );
}

describe('Repeater', () => {
  it('renders the legend and an item per entry', () => {
    render(
      <Harness
        initial={[
          { id: 'a', name: 'GitHub' },
          { id: 'b', name: 'Blog' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Links' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Blog' })).toBeInTheDocument();
  });

  it('shows the empty hint when there are no items', () => {
    render(<Harness initial={[]} />);
    expect(screen.getByText('No links yet.')).toBeInTheDocument();
  });

  it('appends a new item when Add is clicked', () => {
    render(<Harness initial={[{ id: 'a', name: 'GitHub' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getAllByLabelText('Name')).toHaveLength(2);
  });

  it('removes the targeted item', () => {
    render(
      <Harness
        initial={[
          { id: 'a', name: 'GitHub' },
          { id: 'b', name: 'Blog' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove: GitHub' }));
    expect(screen.queryByRole('group', { name: 'GitHub' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Blog' })).toBeInTheDocument();
  });

  it('disables Move up on the first item and Move down on the last', () => {
    render(
      <Harness
        initial={[
          { id: 'a', name: 'GitHub' },
          { id: 'b', name: 'Blog' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Move up: GitHub' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down: Blog' })).toBeDisabled();
  });

  it('reorders items with Move down', () => {
    render(
      <Harness
        initial={[
          { id: 'a', name: 'GitHub' },
          { id: 'b', name: 'Blog' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move down: GitHub' }));
    const captions = screen
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-label'))
      .filter((label) => label === 'GitHub' || label === 'Blog');
    expect(captions).toEqual(['Blog', 'GitHub']);
  });

  it('edits an item in place', () => {
    render(<Harness initial={[{ id: 'a', name: 'GitHub' }]} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'GitLab' } });
    expect(screen.getByRole('group', { name: 'GitLab' })).toBeInTheDocument();
  });

  it('has no detectable a11y violations', async () => {
    const { container } = render(
      <Harness
        initial={[
          { id: 'a', name: 'GitHub' },
          { id: 'b', name: 'Blog' },
        ]}
      />,
    );
    expect(await axe.run(container)).toHaveNoViolations();
  });
});
