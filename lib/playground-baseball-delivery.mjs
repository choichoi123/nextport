// Original PNG paths remain the identity used by pose geometry and garment regions.
// Every transport file was verified lossless, including fully transparent RGB.
export const BASEBALL_BATTER_DELIVERIES = Object.freeze({
  "/images/playground/baseball/poses/20261123/batter-ready-right-angle-v4.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-ready-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/right-load-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-load-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v6-foot-candidates/right-plant-v6.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-plant-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v6-foot-candidates/right-precontact-v6.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-precontact-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/right-contact-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-contact-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v6-foot-candidates/right-follow-v6.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-follow-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/right-recovery-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-recovery-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/right-reset-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/right-reset-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/poses/20261123/batter-ready-left-angle-v4.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-ready-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/left-load-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-load-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v6-foot-candidates/left-plant-v6.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-plant-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v6-foot-candidates/left-precontact-v6.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-precontact-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/left-contact-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-contact-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v6-foot-candidates/left-follow-v6.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-follow-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/left-recovery-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-recovery-lossless.webp","width":1024,"height":1536}),
  "/images/playground/baseball/motion/20261123-v5/left-reset-v5.png": Object.freeze({"src":"/images/playground/baseball/delivery/20261124/left-reset-lossless.webp","width":1024,"height":1536}),
})

export function getBaseballBatterDeliverySrc(input) {
  const source = typeof input === 'string' ? input : input?.src
  const record = typeof source === 'string' && Object.hasOwn(BASEBALL_BATTER_DELIVERIES, source) ? BASEBALL_BATTER_DELIVERIES[source] : null
  if (!record) throw new Error('Missing verified baseball image delivery')
  if (typeof input !== 'string' && (input.width !== record.width || input.height !== record.height)) throw new Error('Baseball image delivery dimensions do not match its source')
  return record.src
}

// Shared scene images keep their original PNG identity and dimensions too.
// These separate records do not change the sixteen batter registrations.
export const BASEBALL_SHARED_DELIVERIES = Object.freeze({
  '/images/playground/baseball/concepts/20261123/stadium-batting-view-v1.png': Object.freeze({
    src: '/images/playground/baseball/delivery/20261124/stadium-batting-view-lossless.webp',
    width: 1672,
    height: 941,
  }),
  '/images/playground/baseball/sprites/20261123/pitcher-v2.png': Object.freeze({
    src: '/images/playground/baseball/delivery/20261124/pitcher-v2-lossless.webp',
    width: 1774,
    height: 887,
  }),
})

export function getBaseballSharedDeliverySrc(input) {
  const source = typeof input === 'string' ? input : input?.src
  const record = typeof source === 'string' && Object.hasOwn(BASEBALL_SHARED_DELIVERIES, source) ? BASEBALL_SHARED_DELIVERIES[source] : null
  if (!record) throw new Error('Missing verified shared baseball image delivery')
  if (typeof input !== 'string' && (input.width !== record.width || input.height !== record.height)) throw new Error('Shared baseball image delivery dimensions do not match its source')
  return record.src
}
