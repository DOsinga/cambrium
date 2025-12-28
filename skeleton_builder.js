import { TAU } from './utils.js'

function computeCentroid(segments) {
  let totalWeight = 0
  let cx = 0
  let cy = 0

  for (const seg of segments) {
    const weight = seg.r * seg.r
    cx += seg.x * weight
    cy += seg.y * weight
    totalWeight += weight
  }

  return { x: cx / totalWeight, y: cy / totalWeight }
}

function getOutlinePoint(segments, t, centroid) {
  const angle = t * TAU
  const dirX = Math.cos(angle)
  const dirY = Math.sin(angle)

  let maxDist = 0
  let winningIdx = 0

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const relX = seg.x - centroid.x
    const relY = seg.y - centroid.y

    const a = 1
    const b = -2 * (dirX * relX + dirY * relY)
    const c = relX * relX + relY * relY - seg.r * seg.r

    const discriminant = b * b - 4 * a * c
    if (discriminant >= 0) {
      const d = (-b + Math.sqrt(discriminant)) / (2 * a)
      if (d > maxDist) {
        maxDist = d
        winningIdx = i
      }
    }
  }

  const px = centroid.x + dirX * maxDist
  const py = centroid.y + dirY * maxDist
  const seg = segments[winningIdx]
  const nx = px - seg.x
  const ny = py - seg.y
  const nlen = Math.sqrt(nx * nx + ny * ny)
  const normalAngle = Math.atan2(ny / nlen, nx / nlen)

  return {
    x: px,
    y: py,
    angle: normalAngle
  }
}

function buildHighResOutline(segments, numPoints) {
  const centroid = computeCentroid(segments)
  const points = []
  for (let i = 0; i < numPoints; i++) {
    points.push(getOutlinePoint(segments, i / numPoints, centroid))
  }
  return { points, centroid }
}

function resampleByArcLength(hiRes, numSlots) {
  let totalLength = 0
  for (let i = 0; i < hiRes.length; i++) {
    const p0 = hiRes[i]
    const p1 = hiRes[(i + 1) % hiRes.length]
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    totalLength += Math.sqrt(dx * dx + dy * dy)
  }

  const targetSpacing = totalLength / numSlots
  const slots = []

  let accumulated = 0
  let nextTarget = 0

  for (let i = 0; i < hiRes.length; i++) {
    const p0 = hiRes[i]
    const p1 = hiRes[(i + 1) % hiRes.length]
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const segLen = Math.sqrt(dx * dx + dy * dy)

    while (nextTarget <= accumulated + segLen && slots.length < numSlots) {
      const frac = segLen > 0 ? (nextTarget - accumulated) / segLen : 0
      slots.push({
        x: p0.x + frac * dx,
        y: p0.y + frac * dy,
        angle: p0.angle + frac * (p1.angle - p0.angle)
      })
      nextTarget += targetSpacing
    }

    accumulated += segLen
  }

  return slots
}

function circleOverlap(r1, r2, d) {
  if (d >= r1 + r2) return 0
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2

  const r1sq = r1 * r1
  const r2sq = r2 * r2
  const dsq = d * d

  const a1 = r1sq * Math.acos((dsq + r1sq - r2sq) / (2 * d * r1))
  const a2 = r2sq * Math.acos((dsq + r2sq - r1sq) / (2 * d * r2))
  const a3 = 0.5 * Math.sqrt((r1 + r2 + d) * (-r1 + r2 + d) * (r1 - r2 + d) * (r1 + r2 - d))

  return a1 + a2 - a3
}

export function computeArea(segments) {
  let area = 0
  for (const seg of segments) {
    area += Math.PI * seg.r * seg.r
  }

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const dx = segments[j].x - segments[i].x
      const dy = segments[j].y - segments[i].y
      const d = Math.sqrt(dx * dx + dy * dy)
      area -= circleOverlap(segments[i].r, segments[j].r, d)
    }
  }

  return area
}

export function buildSlots(bodySegments, radialRepeats, numSlots) {
  if (bodySegments.length === 0) {
    return {
      slots: buildCircleSlots(numSlots),
      segments: [{ x: 0, y: 0, r: 1 / Math.sqrt(Math.PI) }],
      maxExtent: 1 / Math.sqrt(Math.PI)
    }
  }

  const segments = []
  for (let r = 0; r < radialRepeats; r++) {
    const angle = (r / radialRepeats) * TAU
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    for (const s of bodySegments) {
      if (s.distance === 0 && r > 0) continue
      segments.push({
        x: s.distance * cos,
        y: s.distance * sin,
        r: s.radius
      })
    }
  }

  const area = computeArea(segments)

  const { points: hiRes, centroid } = buildHighResOutline(segments, numSlots * 10)
  const rawSlots = resampleByArcLength(hiRes, numSlots)

  const scale = 1 / Math.sqrt(area)

  const normalizedSlots = rawSlots.map(slot => ({
    x: (slot.x - centroid.x) * scale,
    y: (slot.y - centroid.y) * scale,
    angle: slot.angle
  }))

  const normalizedSegments = segments.map(seg => ({
    x: (seg.x - centroid.x) * scale,
    y: (seg.y - centroid.y) * scale,
    r: seg.r * scale
  }))

  let maxExtent = 0
  for (const slot of normalizedSlots) {
    const dist = Math.sqrt(slot.x * slot.x + slot.y * slot.y)
    if (dist > maxExtent) maxExtent = dist
  }

  return {
    slots: normalizedSlots,
    segments: normalizedSegments,
    maxExtent
  }
}

export function buildCircleSlots(numSlots = 120) {
  const slots = []

  for (let i = 0; i < numSlots; i++) {
    const angle = (i / numSlots) * TAU
    slots.push({
      x: Math.cos(angle),
      y: Math.sin(angle),
      angle: angle
    })
  }

  return slots
}