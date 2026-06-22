/**
 * The chat-style contact widget (DOM shell).
 *
 * A small launcher in the corner opens a panel that walks the visitor through
 * email → message → confirm → send, then POSTs to the contact endpoint. All
 * visitor input is rendered with `textContent` (never `innerHTML`), so the chat
 * log cannot become a DOM-XSS sink. The testable logic (validation limits, i18n,
 * payload, error mapping) lives in the sibling pure modules.
 */

import { resolveConfig, type ContactWidgetOptions, type ResolvedConfig } from './config.js';
import { t, type MessageKey } from './i18n.js';
import { buildSubmission, messageKeyForError, type SubmissionState } from './protocol.js';

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
}

interface TurnstileApi {
  render(element: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId?: string): void;
}

type Step = 'email' | 'message' | 'confirm' | 'sending' | 'done';

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getTurnstile(): TurnstileApi | undefined {
  return (globalThis as { turnstile?: TurnstileApi }).turnstile;
}

let turnstileScriptPromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  const existing = getTurnstile();
  if (existing) return Promise.resolve(existing);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.addEventListener('load', () => {
      const api = getTurnstile();
      if (api) resolve(api);
      else reject(new Error('turnstile unavailable after load'));
    });
    script.addEventListener('error', () => reject(new Error('turnstile script failed to load')));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A small, self-contained chat-bubble icon for the launcher (built without innerHTML). */
function chatIcon(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '26');
  svg.setAttribute('height', '26');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute(
    'd',
    'M12 3C6.5 3 2 6.58 2 11c0 2.4 1.32 4.56 3.4 6.04L5 21l3.9-2.05c.98.26 2.02.4 3.1.4 5.5 0 10-3.58 10-8s-4.5-8-10-8z',
  );
  svg.appendChild(path);
  return svg;
}

/** A mounted contact widget instance. */
export class ContactWidget {
  private readonly cfg: ResolvedConfig;
  private readonly state: SubmissionState;
  private step: Step = 'email';
  private opened = false;
  private greeted = false;
  private turnstileRendered = false;

  private root!: HTMLDivElement;
  private launcher!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private log!: HTMLDivElement;
  private turnstileHost!: HTMLDivElement;
  private form!: HTMLFormElement;
  private input!: HTMLInputElement;
  private honeypot!: HTMLInputElement;
  private send!: HTMLButtonElement;

  constructor(options: ContactWidgetOptions) {
    this.cfg = resolveConfig(options);
    this.state = {
      email: '',
      message: '',
      token: '',
      honeypot: '',
      locale: this.cfg.locale,
      ...(this.cfg.pageUrl ? { pageUrl: this.cfg.pageUrl } : {}),
    };
  }

  private tr(key: MessageKey): string {
    return t(this.cfg.locale, key);
  }

  /** Build the DOM and attach the widget to `parent` (defaults to `document.body`). */
  mount(parent: HTMLElement = document.body): void {
    this.root = make('div', 'tkc-root');

    this.launcher = make('button', 'tkc-launcher');
    this.launcher.type = 'button';
    this.launcher.setAttribute('aria-haspopup', 'dialog');
    this.launcher.setAttribute('aria-label', this.tr('launcher'));
    this.launcher.append(chatIcon());
    this.launcher.addEventListener('click', () => this.open());

    this.panel = make('div', 'tkc-panel tkc-hidden');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', this.tr('title'));

    const header = make('div', 'tkc-header');
    header.append(make('span', undefined, this.tr('title')));
    const close = make('button', 'tkc-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', this.tr('close'));
    close.addEventListener('click', () => this.close());
    header.append(close);

    this.log = make('div', 'tkc-log');
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-live', 'polite');

    this.turnstileHost = make('div', 'tkc-turnstile');

    this.form = make('form', 'tkc-form');
    this.honeypot = make('input', 'tkc-honeypot');
    this.honeypot.type = 'text';
    this.honeypot.tabIndex = -1;
    this.honeypot.autocomplete = 'off';
    this.honeypot.setAttribute('aria-hidden', 'true');
    this.honeypot.name = 'company';

    this.input = make('input', 'tkc-input');
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    this.input.setAttribute('aria-label', this.tr('title'));

    this.send = make('button', 'tkc-send', this.tr('send'));
    this.send.type = 'submit';

    this.form.append(this.honeypot, this.input, this.send);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.onSubmit();
    });

    this.panel.append(header, this.log, this.turnstileHost, this.form);
    this.root.append(this.launcher, this.panel);
    parent.append(this.root);

    // Dismiss on an outside click/tap or Escape. Clicks inside the widget are
    // contained by `root`, so the click that opens the panel never self-closes
    // it, and interacting with the chat itself does not close it either.
    document.addEventListener('click', (event) => {
      if (!this.opened) return;
      const target = event.target;
      if (target instanceof Node && this.root.contains(target)) return;
      this.close(false);
    });
    document.addEventListener('keydown', (event) => {
      if (this.opened && event.key === 'Escape') this.close();
    });
  }

  private open(): void {
    if (this.opened) return;
    this.opened = true;
    this.launcher.classList.add('tkc-hidden');
    this.panel.classList.remove('tkc-hidden');
    if (!this.greeted) {
      this.greeted = true;
      this.botSay('greeting');
      this.botSay('askEmail');
    }
    this.setStep('email');
    this.input.focus();
  }

  private close(returnFocus = true): void {
    this.opened = false;
    this.panel.classList.add('tkc-hidden');
    this.launcher.classList.remove('tkc-hidden');
    if (returnFocus) this.launcher.focus();
  }

  private botSay(key: MessageKey): void {
    this.appendMessage('tkc-msg-bot', this.tr(key));
  }

  private appendMessage(role: 'tkc-msg-bot' | 'tkc-msg-user', text: string): void {
    // textContent — never innerHTML — so visitor input is inert in the DOM.
    const msg = make('div', `tkc-msg ${role}`, text);
    this.log.append(msg);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private setStep(step: Step): void {
    this.step = step;
    const typing = step === 'email' || step === 'message';
    this.input.classList.toggle('tkc-hidden', !typing);
    this.input.placeholder =
      step === 'email' ? this.tr('emailPlaceholder') : this.tr('messagePlaceholder');
    this.input.value = '';
    this.send.disabled = step === 'sending';
    this.send.textContent = step === 'sending' ? this.tr('sending') : this.tr('send');
    this.form.classList.toggle('tkc-hidden', step === 'done');
  }

  private async onSubmit(): Promise<void> {
    switch (this.step) {
      case 'email': {
        const value = this.input.value.trim();
        if (!looksLikeEmail(value)) {
          this.botSay('errorEmail');
          return;
        }
        this.state.email = value;
        this.appendMessage('tkc-msg-user', value);
        this.botSay('askMessage');
        this.setStep('message');
        this.input.focus();
        return;
      }
      case 'message': {
        const value = this.input.value.trim();
        if (value === '') return;
        this.state.message = value;
        this.appendMessage('tkc-msg-user', value);
        this.botSay('confirm');
        this.setStep('confirm');
        this.renderTurnstile();
        return;
      }
      case 'confirm': {
        if (!this.state.token) {
          this.botSay('challengePrompt');
          return;
        }
        await this.submitInquiry();
        return;
      }
      default:
        return;
    }
  }

  private renderTurnstile(): void {
    if (this.turnstileRendered) return;
    this.turnstileRendered = true;
    loadTurnstile()
      .then((api) => {
        api.render(this.turnstileHost, {
          sitekey: this.cfg.siteKey,
          theme: 'auto',
          language: this.cfg.locale,
          callback: (token) => {
            this.state.token = token;
          },
          'expired-callback': () => {
            this.state.token = '';
          },
          'error-callback': () => {
            this.state.token = '';
          },
        });
      })
      .catch(() => {
        this.botSay('errorGeneric');
      });
  }

  private async submitInquiry(): Promise<void> {
    this.state.honeypot = this.honeypot.value;
    this.setStep('sending');
    this.botSay('sending');

    let ok = false;
    let code: string | undefined;
    try {
      const response = await fetch(this.cfg.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildSubmission(this.state)),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      ok = response.ok && data?.ok === true;
      code = data?.error;
    } catch {
      // Network error — `ok` stays false (from its initializer).
    }

    if (ok) {
      this.botSay('done');
      this.setStep('done');
      return;
    }

    this.botSay(messageKeyForError(code));
    this.state.token = '';
    const api = getTurnstile();
    if (api) api.reset();
    this.send.textContent = this.tr('retry');
    this.send.disabled = false;
    this.step = 'confirm';
  }
}

/** Create and mount a {@link ContactWidget}. */
export function mountContactWidget(
  options: ContactWidgetOptions,
  parent?: HTMLElement,
): ContactWidget {
  const widget = new ContactWidget(options);
  widget.mount(parent);
  return widget;
}
