const { resolveSkeletonCredentials } = require('../../main/services/unchain/skeleton_credentials');
const capture = require('../fixtures/managed_code_credentials.json');
test('actual managed-source credential producer is accepted and preserves its source fence', () => {
  const readSecret = jest.fn(() => 'SENTINEL');
  const result = resolveSkeletonCredentials(capture.requirements, capture.query, { readSecret });
  expect(result.scope).toEqual(capture.requirements.scope);
  expect(result.scope.schema).toBe('pupu.skeleton_credential_scope.v2');
  expect(readSecret).toHaveBeenCalledTimes(1);
});
test.each([['v1','v2'],['v2','v1'],['v99','v2'],['v2','v99']])('mixed credential contracts %s/%s fail before vault', (outer, inner) => {
  const requirements = JSON.parse(JSON.stringify(capture.requirements));
  requirements.schema = `pupu.skeleton_credential_requirements.${outer}`;
  requirements.scope.schema = `pupu.skeleton_credential_scope.${inner}`;
  const readSecret = jest.fn();
  expect(() => resolveSkeletonCredentials(requirements, capture.query, { readSecret })).toThrow();
  expect(readSecret).not.toHaveBeenCalled();
});
