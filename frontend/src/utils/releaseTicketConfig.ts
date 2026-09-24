export type RepoId = 'MS' | 'MSWEB' | 'FALCON-BOBCRM';

// ISO-8601 week number of the current date, for MS's "Legacy Release - Week N - " prefix.
const isoWeek = (): number => {
  const d = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export interface RepoConfig {
  id: RepoId;
  label: string;
  description: string;
  icon: string;
  descriptionPrefix: () => string;
  needsChannel: boolean;
}

export const REPO_CONFIGS: Record<RepoId, RepoConfig> = {
  MS: {
    id: 'MS',
    label: 'MS',
    description: 'Legacy MS project release',
    icon: 'Server',
    descriptionPrefix: () => `Legacy Release - Week ${isoWeek()} - `,
    needsChannel: false,
  },
  MSWEB: {
    id: 'MSWEB',
    label: 'MSWEB',
    description: 'MS-WEB release',
    icon: 'Globe',
    descriptionPrefix: () => 'Release Includes - ',
    needsChannel: false,
  },
  'FALCON-BOBCRM': {
    id: 'FALCON-BOBCRM',
    label: 'FALCON-BOBCRM',
    description: 'Falcon MCS microservice release',
    icon: 'Database',
    descriptionPrefix: () => 'Release Falcon MCS - ',
    needsChannel: true,
  },
};

export const REPO_ORDER: RepoId[] = ['MS', 'MSWEB', 'FALCON-BOBCRM'];

// Octopus Channel Name options for FALCON-BOBCRM - placeholder list of the 9 known channels,
// pending the final list/order from the user. Data-driven so updating it later is a one-line change.
export const FALCON_BOBCRM_CHANNELS: string[] = [
  'falcon-bobcrm-specs-service',
  'falcon-bobcrm-bing-service',
  'falcon-bobcrm-common-infra-service',
  'falcon-bobcrm-extras-service',
  'falcon-bobcrm-reseller-service',
  'falcon-bobcrm-sms-campaign-service',
  'falcon-bobcrm-zoho-service',
  'falcon-bobcrm-billing-automation-service',
  'falcon-bobcrm-billing-service',
];

export const ENVIRONMENT_OPTIONS = ['Pre-Prod', 'Prod', 'Prod-Beta', 'PRODFALLBACK'] as const;
export type EnvironmentOption = typeof ENVIRONMENT_OPTIONS[number];

export const RELEASE_TYPE_OPTIONS: Record<EnvironmentOption, string[]> = {
  'Pre-Prod': ['N/A'],
  Prod: ['Normal Release', 'Exception Release', 'HotFix Release'],
  'Prod-Beta': ['Normal Release', 'Exception Release'],
  PRODFALLBACK: ['Normal Release', 'Exception Release', 'HotFix Release'],
};

export const DEFAULT_QA_TOUCH_URL = 'https://foodhub.qatouch.com/v2#/overview/p/8vek';
