export type DiffLineType = 'hunk' | 'context' | 'add' | 'remove';

export interface ParsedDiffLine {
  type: DiffLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Parses a GitHub-style unified diff `patch` string (as returned by the
 * `GET /repos/{owner}/{repo}/pulls/{pr}/files` "patch" field) into per-line
 * records carrying old/new line numbers, for GitHub-style gutter rendering.
 */
export const parsePatch = (patch: string): ParsedDiffLine[] => {
  if (!patch) return [];

  const lines = patch.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of lines) {
    const hunkMatch = rawLine.match(HUNK_HEADER);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[3], 10);
      result.push({ type: 'hunk', content: rawLine });
      continue;
    }

    if (rawLine.startsWith('+')) {
      result.push({ type: 'add', content: rawLine.slice(1), newLine });
      newLine += 1;
    } else if (rawLine.startsWith('-')) {
      result.push({ type: 'remove', content: rawLine.slice(1), oldLine });
      oldLine += 1;
    } else {
      // Context line (leading space) or a trailing "\ No newline at end of file" marker.
      result.push({ type: 'context', content: rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
  }

  return result;
};
