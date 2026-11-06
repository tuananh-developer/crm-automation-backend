import { ArgumentsHost, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not expose unexpected database error details in a 500 response', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status };
    const request = {
      method: 'POST',
      url: '/api/v1/auth/register',
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const filter = new AllExceptionsFilter();
    filter.catch(
      new Error(
        'duplicate key value violates unique constraint "IDX_users_email"',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'InternalServerError',
        message: 'Internal server error',
      }),
    );
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain(
      'IDX_users_email',
    );
  });
});
