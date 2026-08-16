import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BRANCH_CUSTOMER_STATUSES,
  branchAvailabilityUpdate,
  branchCustomerStatusUpdate,
  getBranchCustomerStatus,
  isBranchSelectable,
} from '../src/modules/pos/lib/branch-availability.js'

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

test('owner visibility options map to operational branch availability', () => {
  assert.deepEqual(BRANCH_CUSTOMER_STATUSES.map(option => option.label), [
    'Operational',
    'Coming Soon',
    'Hidden',
  ])
  assert.deepEqual(branchCustomerStatusUpdate('operating'), {
    is_active: true,
    operational_status: 'operating',
  })
  assert.deepEqual(branchCustomerStatusUpdate('pre_opening'), {
    is_active: false,
    operational_status: 'pre_opening',
  })
  assert.deepEqual(branchCustomerStatusUpdate('closed'), {
    is_active: false,
    operational_status: 'closed',
  })
})

test('coming-soon and hidden branches cannot be selected for POS ordering', () => {
  assert.equal(getBranchCustomerStatus({ operational_status: 'pre_opening' }), 'pre_opening')
  assert.equal(getBranchCustomerStatus({ operational_status: 'closed' }), 'closed')
  assert.equal(isBranchSelectable({ is_active: true, operational_status: 'pre_opening' }), false)
  assert.equal(isBranchSelectable({ is_active: true, operational_status: 'closed' }), false)
})
