import { describe, expect, it } from 'vitest';
import { errorMessage } from './api.js';

describe('errorMessage', () => {
  it('shows the plain reason the backend gave, not the JSON around it', () => {
    expect(errorMessage(400, '{"detail":"That folder does not exist."}')).toBe('That folder does not exist.');
  });

  it('keeps the status and body when there is no plain reason', () => {
    expect(errorMessage(500, 'Internal Server Error')).toBe('API error 500: Internal Server Error');
    expect(errorMessage(422, '{"detail":[{"msg":"field required"}]}')).toBe('API error 422: {"detail":[{"msg":"field required"}]}');
    expect(errorMessage(400, '{"detail":"  "}')).toBe('API error 400: {"detail":"  "}');
    expect(errorMessage(502, '')).toBe('API error 502: ');
  });
});
