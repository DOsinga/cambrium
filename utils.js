export const TAU = Math.PI * 2

export function rand(a = 1, b = 0) {
  return Math.random() * (a - b) + b
}

export function randn() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(TAU * v)
}

export function clamp(x, a, b) {
  return x < a ? a : (x > b ? b : x)
}

export function normalizeAngle(a) {
  while (a < -Math.PI) a += TAU
  while (a > Math.PI) a -= TAU
  return a
}

export function colorFromHue(h, s = 50, l = 45) {
  // h is 0-360
  const c = (1 - Math.abs(2 * l/100 - 1)) * s/100
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l/100 - c / 2

  let r, g, b
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ]
}
