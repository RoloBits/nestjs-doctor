export const APP_CONFIG = Symbol("APP_CONFIG");

export interface AppConfig {
  readonly currency: string;
  readonly maxOrderLines: number;
}

export function loadConfig(): AppConfig {
  return { currency: "USD", maxOrderLines: 50 };
}
