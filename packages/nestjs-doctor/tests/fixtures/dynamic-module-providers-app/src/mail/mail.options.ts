export const MAIL_OPTIONS = Symbol('MAIL_OPTIONS');

export interface MailOptions {
  from: string;
}

export interface MailOptionsFactory {
  createMailOptions(): MailOptions;
}
