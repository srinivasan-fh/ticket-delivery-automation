// Optional Zoho Cliq incoming-webhook post for stage-done updates. PR and
// QA notifications are sent by the Dev Automation Portal itself.
export async function postToCliq(webhookUrl, text, fetchImpl = fetch) {
  if (!webhookUrl) return false;
  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
