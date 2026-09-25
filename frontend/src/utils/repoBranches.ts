// Release branches per repo, shown on the ticket page. Defaults below; edits made on the
// page are saved in this browser (localStorage) and override them per repo.

export interface ReleaseBranch { branch: string; label: string }
export interface RepoBranches { prod: ReleaseBranch[]; sit: ReleaseBranch[] }
export interface DeliveryRepo { name: string; owner: string | null }

export const DELIVERY_REPOS: DeliveryRepo[] = [
  { name: 'mytakeaway2.0', owner: 'uktech' },
  { name: 'falcon-bobcrm-service', owner: 'uktech' },
  { name: 'ms-crons', owner: 'uktech' },
  { name: 'BOB-CRM', owner: 'uktech' },
  { name: 'falcon', owner: null },
  { name: 't2s-db', owner: 'uktech' },
];

export const DEFAULT_BRANCHES: Record<string, RepoBranches> = {
  'mytakeaway2.0': {
    prod: [
      { branch: 'main', label: 'web' },
      { branch: 'mobile_release', label: 'mobile' },
      { branch: 'development_r79', label: 'mobile-mty-version' },
    ],
    sit: [
      { branch: 'ms_development', label: '' },
      { branch: 'ms_mobile_release', label: '' },
    ],
  },
};

const BRANCHES_KEY = 'ticketDelivery.repoBranches.v1';
const TICKET_REPOS_KEY = 'ticketDelivery.ticketRepos.v1';

const read = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked - changes last for this visit only */
  }
};

export const loadBranches = (): Record<string, RepoBranches> => {
  const saved = read<Record<string, RepoBranches>>(BRANCHES_KEY, {});
  const all: Record<string, RepoBranches> = {};
  for (const repo of DELIVERY_REPOS) {
    all[repo.name] = saved[repo.name] || DEFAULT_BRANCHES[repo.name] || { prod: [], sit: [] };
  }
  return all;
};

export const saveRepoBranches = (repo: string, branches: RepoBranches) => {
  write(BRANCHES_KEY, { ...read<Record<string, RepoBranches>>(BRANCHES_KEY, {}), [repo]: branches });
};

export const loadTicketRepos = (key: string): string[] => read<Record<string, string[]>>(TICKET_REPOS_KEY, {})[key] || [];

export const saveTicketRepos = (key: string, repos: string[]) => {
  write(TICKET_REPOS_KEY, { ...read<Record<string, string[]>>(TICKET_REPOS_KEY, {}), [key]: repos });
};
