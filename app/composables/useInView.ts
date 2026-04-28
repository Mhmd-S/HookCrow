export function useInView(options?: IntersectionObserverInit) {
  const el = ref<HTMLElement | null>(null)
  const inView = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        inView.value = true
        observer?.disconnect()
      }
    }, { rootMargin: '200px', ...options })
    if (el.value) observer.observe(el.value)
  })

  onUnmounted(() => observer?.disconnect())

  return { el, inView }
}
