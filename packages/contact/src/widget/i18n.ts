/**
 * Widget UI strings, keyed by locale. Pure data + a lookup helper, so the copy
 * is testable without a DOM. The widget follows the page locale (resolved in
 * {@link ./config}); both `ja` and `en` are always fully populated.
 */

import type { ContactLocale } from '../types.js';

export type MessageKey =
  | 'launcher'
  | 'title'
  | 'close'
  | 'greeting'
  | 'askEmail'
  | 'askMessage'
  | 'confirm'
  | 'send'
  | 'sending'
  | 'verifying'
  | 'done'
  | 'retry'
  | 'challengePrompt'
  | 'emailPlaceholder'
  | 'messagePlaceholder'
  | 'errorEmail'
  | 'errorChallenge'
  | 'errorGeneric';

const STRINGS: Record<ContactLocale, Record<MessageKey, string>> = {
  ja: {
    launcher: 'お問い合わせ',
    title: 'お問い合わせ',
    close: '閉じる',
    greeting: 'こんにちは。お問い合わせ内容をお送りください。確認後、メールで返信します。',
    askEmail: 'まず、返信先のメールアドレスを入力してください。',
    askMessage: 'ありがとうございます。次にお問い合わせ内容を入力してください。',
    confirm: '送信してよろしいですか？',
    send: '送信',
    sending: '送信中…',
    verifying: '確認中…',
    done: 'お問い合わせを受け付けました。確認後、メールで返信します。',
    retry: 'もう一度送信する',
    challengePrompt: '送信前に確認にお答えください。',
    emailPlaceholder: 'you@example.com',
    messagePlaceholder: 'お問い合わせ内容',
    errorEmail: 'メールアドレスの形式が正しくないようです。',
    errorChallenge: '確認に失敗しました。もう一度お試しください。',
    errorGeneric: '送信に失敗しました。時間をおいて再度お試しください。',
  },
  en: {
    launcher: 'Contact',
    title: 'Contact',
    close: 'Close',
    greeting: "Hi! Send your question below and we'll reply by email.",
    askEmail: 'First, what email address should we reply to?',
    askMessage: 'Thanks! Now, what would you like to ask?',
    confirm: 'Ready to send?',
    send: 'Send',
    sending: 'Sending…',
    verifying: 'Verifying…',
    done: "Got it — we'll review your message and reply by email.",
    retry: 'Try again',
    challengePrompt: 'Please complete the check before sending.',
    emailPlaceholder: 'you@example.com',
    messagePlaceholder: 'Your message',
    errorEmail: "That email address doesn't look right.",
    errorChallenge: 'Verification failed. Please try again.',
    errorGeneric: 'Something went wrong. Please try again later.',
  },
};

/** Look up a localized UI string. */
export function t(locale: ContactLocale, key: MessageKey): string {
  return STRINGS[locale][key];
}
