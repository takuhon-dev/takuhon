import type { Contact } from '@takuhon/core';

import styles from './ContactInfo.module.css';

export interface ContactInfoProps {
  contact: Contact;
}

export function ContactInfo({ contact }: ContactInfoProps): React.JSX.Element | null {
  const showEmail = contact.showEmail === true && contact.email !== undefined;
  if (!showEmail && contact.formUrl === undefined) return null;

  return (
    <section className={styles.section} aria-labelledby="takuhon-contact-heading">
      <h2 id="takuhon-contact-heading" className={styles.heading}>
        Contact
      </h2>
      <ul className={styles.list}>
        {showEmail && contact.email !== undefined ? (
          <li className={styles.item}>
            <a className={styles.link} href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          </li>
        ) : null}
        {contact.formUrl !== undefined ? (
          <li className={styles.item}>
            <a
              className={styles.link}
              href={contact.formUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Contact form
            </a>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
