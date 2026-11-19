export const SUPPORTED_FOLLOW_UP_CHANNEL = 'EMAIL';
export const SUPPORTED_FOLLOW_UP_ACTION = 'SEND_EMAIL';

export function isSupportedFollowUpAction(
  channel: unknown,
  actionType: unknown,
): boolean {
  return (
    typeof channel === 'string' &&
    typeof actionType === 'string' &&
    channel.trim().toUpperCase() === SUPPORTED_FOLLOW_UP_CHANNEL &&
    actionType.trim().toUpperCase() === SUPPORTED_FOLLOW_UP_ACTION
  );
}

export function getUnsupportedFollowUpActionMessage(
  channel: unknown,
  actionType: unknown,
): string {
  const normalizedChannel =
    typeof channel === 'string' ? channel.trim().toUpperCase() : 'UNKNOWN';
  const normalizedAction =
    typeof actionType === 'string' ? actionType.trim().toUpperCase() : 'UNKNOWN';

  return (
    `Follow-up action '${normalizedChannel}/${normalizedAction}' is not supported. ` +
    `Only ${SUPPORTED_FOLLOW_UP_CHANNEL}/${SUPPORTED_FOLLOW_UP_ACTION} is currently available.`
  );
}
