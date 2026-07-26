export function shouldReloadForServiceWorkerUpdate(pathname = '') {
  return pathname === '/products' || pathname.startsWith('/products/')
}

export function createServiceWorkerControllerChangeHandler({
  getPathname,
  reload,
}) {
  let isReloading = false

  return () => {
    if (isReloading || !shouldReloadForServiceWorkerUpdate(getPathname())) return

    isReloading = true
    reload()
  }
}
