import jsforce from 'jsforce';

let _conn: jsforce.Connection | null = null;

export async function getSFConnection(): Promise<jsforce.Connection> {
  // Reuse connection if already authenticated
  if (_conn && (_conn as unknown as { accessToken?: string }).accessToken) {
    return _conn;
  }

  _conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  });

  await _conn.login(
    process.env.SF_USERNAME!,
    process.env.SF_PASSWORD! // password + security token concatenated
  );

  return _conn;
}
