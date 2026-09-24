import test from 'node:test';
import assert from 'node:assert/strict';
import { validateServiceAccountCredentials } from '../src/services/firebaseAdmin';

test('Service Account Parser: accepts fully valid credentials with normal or escaped newlines', () => {
  const validCred = {
    project_id: 'froc-test-proj',
    client_email: 'service-account@froc-test-proj.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5\\n-----END PRIVATE KEY-----\\n',
  };

  const result = validateServiceAccountCredentials(validCred);
  assert.ok(result);
  assert.equal(result.project_id, 'froc-test-proj');
  assert.equal(result.client_email, 'service-account@froc-test-proj.iam.gserviceaccount.com');
  assert.ok(result.private_key.includes('\n'));
  assert.ok(!result.private_key.includes('\\n'));
});

test('Service Account Parser: rejects missing project_id', () => {
  const missingProj = {
    project_id: '',
    client_email: 'test@example.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  };
  assert.equal(validateServiceAccountCredentials(missingProj), null);
});

test('Service Account Parser: rejects missing client_email', () => {
  const missingEmail = {
    project_id: 'froc-test',
    client_email: '',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  };
  assert.equal(validateServiceAccountCredentials(missingEmail), null);
});

test('Service Account Parser: rejects invalid email without @', () => {
  const badEmail = {
    project_id: 'froc-test',
    client_email: 'not-an-email',
    private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  };
  assert.equal(validateServiceAccountCredentials(badEmail), null);
});

test('Service Account Parser: rejects empty or invalid private_key', () => {
  const badKey = {
    project_id: 'froc-test',
    client_email: 'service@froc-test.iam.gserviceaccount.com',
    private_key: 'not-a-private-key',
  };
  assert.equal(validateServiceAccountCredentials(badKey), null);
});

test('Service Account Parser: rejects non-object or null input', () => {
  assert.equal(validateServiceAccountCredentials(null), null);
  assert.equal(validateServiceAccountCredentials(undefined), null);
  assert.equal(validateServiceAccountCredentials('some string'), null);
  assert.equal(validateServiceAccountCredentials([]), null);
});
