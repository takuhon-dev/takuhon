import type { LocalizedCertification } from '@takuhon/core';

import styles from './Certifications.module.css';

export interface CertificationsProps {
  certifications: LocalizedCertification[];
}

function sortCerts(certs: LocalizedCertification[]): LocalizedCertification[] {
  return [...certs].sort((a, b) => {
    const aOrder = a.order ?? Number.POSITIVE_INFINITY;
    const bOrder = b.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.issueDate.localeCompare(a.issueDate);
  });
}

export function Certifications({ certifications }: CertificationsProps): React.JSX.Element | null {
  if (certifications.length === 0) return null;
  const ordered = sortCerts(certifications);

  return (
    <section className={styles.section} aria-labelledby="takuhon-certifications-heading">
      <h2 id="takuhon-certifications-heading" className={styles.heading}>
        Certifications
      </h2>
      <ul className={styles.list}>
        {ordered.map((cert) => (
          <li key={cert.id} className={styles.item}>
            <p className={styles.title}>
              {cert.url ? (
                <a
                  className={styles.link}
                  href={cert.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {cert.title}
                </a>
              ) : (
                cert.title
              )}
            </p>
            <p className={styles.issuer}>{cert.issuingOrganization}</p>
            <p className={styles.range}>
              <time dateTime={cert.issueDate}>{cert.issueDate}</time>
              {cert.expirationDate === null ? (
                <span className={styles.tag}> · No expiration</span>
              ) : cert.expirationDate !== undefined ? (
                <>
                  {' – '}
                  <time dateTime={cert.expirationDate}>{cert.expirationDate}</time>
                </>
              ) : null}
            </p>
            {/* credentialId is intentionally not rendered by default — the API
                privacy filter strips it for public responses unless
                meta.privacy.hideCredentialIds is explicitly false. */}
          </li>
        ))}
      </ul>
    </section>
  );
}
