export interface PinnedOctopusProject {
  id: string;
  name: string;
  groupName: string;
}

// Hardcoded so these render instantly on page load, without waiting on the full-space
// overview fetch just to resolve a starred project ID into a name/group.
export const PINNED_OCTOPUS_PROJECTS: PinnedOctopusProject[] = [
  { id: 'Projects-6', name: 'MS', groupName: 'MS' },
];

// Landing on /octopus goes straight into this project's dashboard since it's checked constantly.
export const DEFAULT_OCTOPUS_PROJECT_ID = 'Projects-6';
