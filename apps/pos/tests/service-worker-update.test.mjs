import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createServiceWorkerControllerChangeHandler,
  shouldReloadForServiceWorkerUpdate,
} from '../src/lib/service-worker-update.js'

test('reloads the product catalog after a service worker update', () => {
  assert.equal(shouldReloadForServiceWorkerUpdate('/products'), true)
  assert.equal(shouldReloadForServiceWorkerUpdate('/products/coffee'), true)
  assert.equal(shouldReloadForServiceWorkerUpdate('/pos/branch-123/products'), true)
  assert.equal(shouldReloadForServiceWorkerUpdate('/pos/branch-123/products/coffee'), true)
})

test('does not reload an active POS session after a service worker update', () => {
  assert.equal(shouldReloadForServiceWorkerUpdate('/pos'), false)
  assert.equal(shouldReloadForServiceWorkerUpdate('/pos/terminal'), false)
})

test('controller changes reload the product catalog at most once', () => {
  let reloadCount = 0
  const handleControllerChange = createServiceWorkerControllerChangeHandler({
    getPathname: () => '/products',
    reload: () => {
      reloadCount += 1
    },
  })

  handleControllerChange()
  handleControllerChange()

  assert.equal(reloadCount, 1)
})

test('controller changes leave unrelated pages running', () => {
  let reloadCount = 0
  const handleControllerChange = createServiceWorkerControllerChangeHandler({
    getPathname: () => '/expenses',
    reload: () => {
      reloadCount += 1
    },
  })

  handleControllerChange()

  assert.equal(reloadCount, 0)
})
