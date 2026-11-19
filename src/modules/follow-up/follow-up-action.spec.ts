import {
  getUnsupportedFollowUpActionMessage,
  isSupportedFollowUpAction,
} from './follow-up-action.js';

describe('follow-up action support policy', () => {
  it('accepts EMAIL/SEND_EMAIL case-insensitively', () => {
    expect(isSupportedFollowUpAction(' email ', 'send_email')).toBe(true);
  });

  it.each([
    ['PHONE', 'SCHEDULE_CALL'],
    ['CALL', 'CALL'],
    ['MESSAGE', 'SEND_SMS'],
    ['SMS', 'SEND_SMS'],
    ['EMAIL', 'SEND_SMS'],
    ['SYSTEM', 'CREATE_TASK'],
  ])('rejects unsupported %s/%s actions', (channel, actionType) => {
    expect(isSupportedFollowUpAction(channel, actionType)).toBe(false);
  });

  it('returns a clear unsupported-action message', () => {
    expect(
      getUnsupportedFollowUpActionMessage('PHONE', 'SCHEDULE_CALL'),
    ).toContain('Only EMAIL/SEND_EMAIL is currently available');
  });
});
