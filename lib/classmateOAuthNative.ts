import { registerPlugin } from "@capacitor/core";

export type ClassmateOAuthStartResult = {
  callbackUrl?: string;
  cancelled: boolean;
};

export interface ClassmateOAuthPlugin {
  startOAuth(options: {
    url: string;
    callbackScheme?: string;
  }): Promise<ClassmateOAuthStartResult>;
  cancelOAuth(): Promise<void>;
}

export const ClassmateOAuth = registerPlugin<ClassmateOAuthPlugin>(
  "ClassmateOAuth"
);
