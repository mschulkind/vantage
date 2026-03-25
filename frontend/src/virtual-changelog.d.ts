declare module "virtual:changelog" {
  export interface ChangelogEntry {
    version: string;
    date: string;
    sections: { title: string; items: string[] }[];
  }

  export const changelog: ChangelogEntry[];
  export const appVersion: string;
}
