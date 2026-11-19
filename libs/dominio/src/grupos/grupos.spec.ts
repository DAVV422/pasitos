import { isParaLaPersona } from './grupos';

describe('grupos (HU-325)', () => {
  it('sin grupo lo ve todo el evento; con grupo, solo quien está en él', () => {
    expect(isParaLaPersona(null, [])).toBe(true);
    expect(isParaLaPersona('vip', ['vip', 'prensa'])).toBe(true);
    expect(isParaLaPersona('vip', ['prensa'])).toBe(false);
    expect(isParaLaPersona('vip', [])).toBe(false);
  });
});
