import styles from './Footer.module.css';

export function Footer(): React.JSX.Element {
  return (
    <footer className={styles.footer}>
      <p className={styles.line}>
        Powered by{' '}
        <a
          className={styles.link}
          href="https://github.com/takashi-matsuyama/meport"
          target="_blank"
          rel="noopener noreferrer"
        >
          meport
        </a>
      </p>
    </footer>
  );
}
