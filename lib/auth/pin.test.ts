import { describe, expect, it } from 'vitest';

import { hashPin, validatePin, verifyPin, PIN_LENGTH } from './pin';

describe('PIN rules', () => {
  it('requires exactly six digits', () => {
    expect(PIN_LENGTH).toBe(6);
    expect(validatePin('12345').ok).toBe(false);
    expect(validatePin('1234567').ok).toBe(false);
    expect(validatePin('284917').ok).toBe(true);
  });

  it('rejects anything that is not a digit', () => {
    expect(validatePin('12345a').reason).toBe('not_digits');
    expect(validatePin('12 456').reason).toBe('not_digits');
    // Unicode digits are not ASCII digits, and the input is numeric-only.
    expect(validatePin('١٢٣٤٥٦').ok).toBe(false);
  });

  it('rejects the two guesses everybody makes first', () => {
    expect(validatePin('000000').reason).toBe('all_same_digit');
    expect(validatePin('777777').reason).toBe('all_same_digit');
    expect(validatePin('123456').reason).toBe('sequential');
    expect(validatePin('654321').reason).toBe('sequential');
  });

  it('does not reject a PIN merely for containing a run', () => {
    // The rule is a straight run end to end, not a digit pattern audit. Every
    // extra rule here is friction on the first screen a manager ever sees.
    expect(validatePin('123457').ok).toBe(true);
    expect(validatePin('112233').ok).toBe(true);
    expect(validatePin('010101').ok).toBe(true);
  });

  it('explains itself in the shop’s voice rather than scolding', () => {
    expect(validatePin('12345').message).toBeDefined();
    expect(validatePin('000000').message).toMatch(/Tony/);
  });
});

describe('hashing', () => {
  it('verifies a PIN against its own hash', async () => {
    const hash = await hashPin('284917');
    expect(await verifyPin('284917', hash)).toBe(true);
    expect(await verifyPin('284918', hash)).toBe(false);
  });

  it('never stores the PIN in the hash', async () => {
    const hash = await hashPin('284917');
    expect(hash).not.toContain('284917');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('salts, so the same PIN hashes differently for two managers', async () => {
    // Without this, the ten rows would leak which managers share a PIN.
    expect(await hashPin('284917')).not.toBe(await hashPin('284917'));
  });

  it('treats a corrupted stored hash as a failed login, not a crash', async () => {
    expect(await verifyPin('284917', 'not-a-hash')).toBe(false);
    expect(await verifyPin('284917', '')).toBe(false);
  });
});
