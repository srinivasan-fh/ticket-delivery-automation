export type DeploymentVisualKind = 'success' | 'progress' | 'failed';

// Octopus deployment "State" values include in-progress states (Queued, Executing) as well
// as terminal ones (Success, Failed, Canceled/Cancelled, TimedOut). Treating anything that
// isn't literally "Success" as a failure (as the original code did) misrenders a deployment
// that's still running - or that just kicked off - as a red X.
export const classifyDeploymentState = (state?: string | null): DeploymentVisualKind => {
  const s = (state || '').toLowerCase();
  if (s === 'success') return 'success';
  if (s === 'executing' || s === 'queued') return 'progress';
  return 'failed';
};

export interface DeploymentVisual {
  kind: DeploymentVisualKind;
  icon: string;
  iconColor: string;
  bg: string;
  border: string;
}

/**
 * `isCurrent` distinguishes the release actually active in an environment right now from a
 * release that succeeded there in the past but has since been superseded by a redeploy of a
 * different release - both are "Success", but only one is the truth of what's running today.
 * A current success renders as a solid filled green badge; a superseded success renders as a
 * muted outline so it reads as history, not as "this is what's live".
 */
export const getDeploymentVisual = (state?: string | null, isCurrent: boolean = true): DeploymentVisual => {
  const kind = classifyDeploymentState(state);

  if (kind === 'success') {
    return isCurrent
      ? { kind, icon: 'Check', iconColor: '#ffffff', bg: '#10b981', border: 'none' }
      : { kind, icon: 'Check', iconColor: '#10b981', bg: 'transparent', border: '1px solid rgba(16, 185, 129, 0.4)' };
  }

  if (kind === 'progress') {
    return { kind, icon: 'Loader', iconColor: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'none' };
  }

  return { kind, icon: 'X', iconColor: '#ffffff', bg: '#ef4444', border: 'none' };
};
