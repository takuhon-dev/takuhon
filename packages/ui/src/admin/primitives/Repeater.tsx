import styles from './Repeater.module.css';

export interface RepeaterProps<T> {
  /** Group caption rendered as the fieldset legend, e.g. `"Links"`. */
  legend: string;
  items: readonly T[];
  /** Receives the next array after an add / remove / reorder / item edit. */
  onChange: (next: T[]) => void;
  /** Render one item's fields; `update` replaces that item in place. */
  renderItem: (item: T, update: (next: T) => void, index: number) => React.ReactNode;
  /** Factory for the entry appended by the Add button. */
  createItem: () => T;
  /** Stable React key per item. Defaults to the index. */
  keyOf?: (item: T, index: number) => string;
  /** Human label for an item, used in the item caption and button names. */
  itemLabel: (item: T, index: number) => string;
  addLabel?: string;
  removeLabel?: string;
  moveUpLabel?: string;
  moveDownLabel?: string;
  /** Shown when there are no items yet. */
  emptyHint?: string;
}

/**
 * Add / remove / reorder editor for a repeating array field (spec §14.2
 * "リピーター"). Reordering uses keyboard-operable Move up / Move down buttons
 * rather than drag-and-drop so the control meets WCAG 2.1 AA (spec §8.5)
 * without a pointer.
 */
export function Repeater<T>({
  legend,
  items,
  onChange,
  renderItem,
  createItem,
  keyOf,
  itemLabel,
  addLabel = 'Add',
  removeLabel = 'Remove',
  moveUpLabel = 'Move up',
  moveDownLabel = 'Move down',
  emptyHint,
}: RepeaterProps<T>): React.JSX.Element {
  const key = keyOf ?? ((_item: T, index: number) => String(index));

  const update = (index: number, next: T): void => {
    const copy = items.slice();
    copy[index] = next;
    onChange(copy);
  };

  const remove = (index: number): void => {
    onChange(items.filter((_item, i) => i !== index));
  };

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length) return;
    const copy = items.slice();
    const [moved] = copy.splice(from, 1);
    if (moved === undefined) return;
    copy.splice(to, 0, moved);
    onChange(copy);
  };

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      {items.length === 0 && emptyHint ? <p className={styles.empty}>{emptyHint}</p> : null}
      <ol className={styles.list}>
        {items.map((item, index) => {
          const caption = itemLabel(item, index);
          return (
            <li key={key(item, index)} className={styles.item}>
              <div role="group" aria-label={caption}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemCaption}>{caption}</span>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`${moveUpLabel}: ${caption}`}
                      disabled={index === 0}
                      onClick={() => {
                        move(index, index - 1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`${moveDownLabel}: ${caption}`}
                      disabled={index === items.length - 1}
                      onClick={() => {
                        move(index, index + 1);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={`${removeLabel}: ${caption}`}
                      onClick={() => {
                        remove(index);
                      }}
                    >
                      {removeLabel}
                    </button>
                  </div>
                </div>
                <div className={styles.itemBody}>
                  {renderItem(
                    item,
                    (next) => {
                      update(index, next);
                    },
                    index,
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => {
          onChange([...items, createItem()]);
        }}
      >
        {addLabel}
      </button>
    </fieldset>
  );
}
