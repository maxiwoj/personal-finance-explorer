import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RESUME_TO_ADD_AFTER_MS, shouldResumeToAdd } from '../lib/app-lifecycle.ts'

const away = { awayMs: RESUME_TO_ADD_AFTER_MS + 1, pathname: '/dashboard', standalone: true, unsavedInput: false }

describe('shouldResumeToAdd', () => {
  it('goes back to /add in the installed app after a long time away', () => {
    assert.equal(shouldResumeToAdd(away), true)
  })

  it('stays after a short time away', () => {
    assert.equal(shouldResumeToAdd({ ...away, awayMs: RESUME_TO_ADD_AFTER_MS }), false)
    assert.equal(shouldResumeToAdd({ ...away, awayMs: 0 }), false)
  })

  it('stays in a browser tab', () => {
    assert.equal(shouldResumeToAdd({ ...away, standalone: false }), false)
  })

  it('keeps unsaved input', () => {
    assert.equal(shouldResumeToAdd({ ...away, unsavedInput: true }), false)
  })

  it('stays on /add and /login', () => {
    assert.equal(shouldResumeToAdd({ ...away, pathname: '/add' }), false)
    assert.equal(shouldResumeToAdd({ ...away, pathname: '/login' }), false)
  })
})
