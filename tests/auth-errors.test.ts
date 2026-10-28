import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MissingScopeError, classifyRefreshError, classifyRefreshStatus } from '../lib/auth-errors.ts'

describe('classifyRefreshStatus', () => {
  it('signs out when the server rejects the session', () => {
    for (const status of [400, 401, 403, 404]) {
      assert.equal(classifyRefreshStatus(status), 'rejected', `status ${status}`)
    }
  })

  it('keeps the session on server errors, timeouts and rate limits', () => {
    for (const status of [500, 502, 503, 504, 408, 429]) {
      assert.equal(classifyRefreshStatus(status), 'network', `status ${status}`)
    }
  })
})

describe('classifyRefreshError', () => {
  it('keeps the session when the request fails to complete', () => {
    assert.equal(classifyRefreshError(new TypeError('Failed to fetch')), 'network')
    assert.equal(classifyRefreshError(new DOMException('The operation timed out.', 'TimeoutError')), 'network')
    assert.equal(classifyRefreshError(new SyntaxError('Unexpected token < in JSON')), 'network')
  })

  it('signs out when the token is missing the required scope', () => {
    assert.equal(classifyRefreshError(new MissingScopeError()), 'rejected')
  })
})
