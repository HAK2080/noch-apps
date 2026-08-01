import test from 'node:test'
import assert from 'node:assert/strict'
import { branchAvailabilityUpdate, isBranchSelectable } from '../src/modules/pos/lib/branch-availability.js'

test('active branches remain selectable and inactive branches are excluded', () => {
  assert.equal(isBranchSelectable({ is_active: true }), true)
  assert.equal(isBranchSelectable({}), true)
  assert.equal(isBranchSelectable({ is_active: false }), false)
})

test('turning a branch off closes operational availability without deleting records', () => {
  assert.deepEqual(branchAvailabilityUpdate(false), {
    is_active: false,
    operational_status: 'closed',
  })
  assert.deepEqual(branchAvailabilityUpdate(true), {
    is_active: true,
    operational_status: 'operating',
  })
})
