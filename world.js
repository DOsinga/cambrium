import { Plant, Animal } from "./creature.js"
import { Genome } from "./genome.js"
import {rand} from "./utils.js";

export const SETTINGS = {
  gravity: 0.000001,
  linearDamping: 0.02,
  angularDamping: 0.04,
  brownianNoise: 15,
  sunlight: 0.09,
  maxVelocity: 6,
  maxAngularVelocity: 0.3,
  minEnergyFraction: 0.2,
  maxFood: 5000,
  livingCost: 0.30,
  baseCreatureCost: 0.08,
  radiusCost: 0.005,
  partsCost: 0.15
}

const timings = {
  totals: {},
  lastTime: 0,
  activeKey: null,
  count: 0,

  start(key) {
    const now = performance.now()
    if (this.activeKey) {
      this.totals[this.activeKey] = (this.totals[this.activeKey] || 0) + (now - this.lastTime)
    }
    this.activeKey = key
    this.lastTime = now
  },

  stop() {
    const now = performance.now()
    if (this.activeKey) {
      this.totals[this.activeKey] = (this.totals[this.activeKey] || 0) + (now - this.lastTime)
    }
    this.activeKey = null
    this.count++

    if (this.count % 100 === 0) {
      const entries = Object.entries(this.totals).map(([k, v]) => [k, (v / this.count).toFixed(2)])
      console.log('Timings (avg ms):', Object.fromEntries(entries))
    }
  },

  report() {
    const total = Object.values(this.totals).reduce((a, b) => a + b, 0)
    const entries = Object.entries(this.totals)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, ((v / total) * 100).toFixed(1) + '%'])
    console.log('Timings:', Object.fromEntries(entries))
  }
}

export class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize
    this.map = new Map()
  }

  clear() {
    for (const cell of this.map.values()) {
      for (const obj of cell) {
        obj._hashKey = undefined
      }
    }
    this.map.clear()
  }

  count() {
    let total = 0
    for (const cell of this.map.values()) {
      total += cell.size
    }
    return total
  }

  insert(obj, x, y) {
    const s = this.cellSize
    const ix = Math.floor(x / s)
    const iy = Math.floor(y / s)
    const k = (ix << 16) ^ (iy & 0xffff)

    if (obj._hashKey === k) return

    if (obj._hashKey !== undefined) {
      const oldCell = this.map.get(obj._hashKey)
      if (oldCell) oldCell.delete(obj)
    }

    let cell = this.map.get(k)
    if (!cell) {
      cell = new Set()
      this.map.set(k, cell)
    }
    cell.add(obj)
    obj._hashKey = k
  }

  remove(obj) {
    if (obj._hashKey !== undefined) {
      const cell = this.map.get(obj._hashKey)
      if (cell) cell.delete(obj)
      obj._hashKey = undefined
    }
  }

  queryArea(x1, y1, x2, y2) {
    const s = this.cellSize
    const ix1 = Math.floor(x1 / s)
    const iy1 = Math.floor(y1 / s)
    const ix2 = Math.floor(x2 / s)
    const iy2 = Math.floor(y2 / s)

    if (ix1 === ix2 && iy1 === iy2) {
      return this.map.get((ix1 << 16) ^ (iy1 & 0xffff)) || new Set()
    }

    const out = new Set()
    for (let iy = iy1; iy <= iy2; iy++) {
      for (let ix = ix1; ix <= ix2; ix++) {
        const cell = this.map.get((ix << 16) ^ (iy & 0xffff))
        if (cell) {
          for (const obj of cell) {
            out.add(obj)
          }
        }
      }
    }
    return out
  }
}

export class World {
  constructor() {
    this.worldRadius = 2400
    this.hash = new SpatialHash(75)
    this.creatures = []
    this.nextId = 1

    for (let i = 0; i < Math.sqrt(this.worldRadius) * 50; i++) {
      const phi = rand(Math.PI * 2)
      const r = rand(this.worldRadius)
      this.add(
        new Plant(
          this,
          Math.cos(phi) * r,
          Math.sin(phi) * r
        )
      )
    }

    const seedCreatures =  120
    for (let i = 0; i < seedCreatures; i++) {
      const phi = rand(Math.PI * 2)
      const r = rand(this.worldRadius * 0.8)
      let g = Genome.createRandom()
      if (!g.validate()) {
        continue
      }

      this.add(
        new Animal(
          this,
          Math.cos(phi) * r,
          Math.sin(phi) * r,
          g
        )
      )
    }

    this.rebuildHash()
  }

  add(c) {
    this.creatures.push(c)
    return c
  }

  rebuildHash() {
    this.hash.clear()
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i]
      this.hash.insert(c, c.x, c.y)
    }
  }

  moved(c) {
    this.hash.insert(c, c.x, c.y)
  }

  findAt(x, y, exclude) {
    const r = 60
    const near = this.hash.queryArea(x - r, y - r, x + r, y + r)
    for (let o of near) {
      if (o === exclude) continue

      const circles = this.getBodyCircles(o)
      for (const c of circles) {
        const dx = x - c.x
        const dy = y - c.y
        if (dx * dx + dy * dy < c.r * c.r) {
          return o
        }
      }
    }
    return null
  }

filterSee(eyeX, eyeY, angle, cone) {
  const eyeDirX = Math.cos(angle)
  const eyeDirY = Math.sin(angle)
  const minDotProduct = Math.cos(cone)
  const range = 280

  const leftAngle = angle - cone
  const rightAngle = angle + cone

  const xLeft = eyeX + Math.cos(leftAngle) * range
  const yLeft = eyeY + Math.sin(leftAngle) * range
  const xRight = eyeX + Math.cos(rightAngle) * range
  const yRight = eyeY + Math.sin(rightAngle) * range

  const minX = Math.min(eyeX, xLeft, xRight)
  const maxX = Math.max(eyeX, xLeft, xRight)
  const minY = Math.min(eyeY, yLeft, yRight)
  const maxY = Math.max(eyeY, yLeft, yRight)

  const nearby = this.hash.queryArea(minX, minY, maxX, maxY)

    let totalRed = 0
    let totalGreen = 0
    let totalBlue = 0

    for (const other of nearby) {
      const dx = other.x - eyeX
      const dy = other.y - eyeY
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < 0.01 || distance > range) continue

      const targetDirectionX = dx / distance
      const targetDirectionY = dy / distance
      const dotProduct = targetDirectionX * eyeDirX + targetDirectionY * eyeDirY

      if (dotProduct < minDotProduct) {
        continue
      }

      const weight = 0.15 / Math.max(6, distance)
      totalRed += weight * other.color[0]
      totalGreen += weight * other.color[1]
      totalBlue += weight * other.color[2]
    }

    const sigmoid = x => x / (1 + x)

    return {
      r: sigmoid(totalRed),
      g: sigmoid(totalGreen),
      b: sigmoid(totalBlue)
    }
  }

  getBodyCircles(creature) {
    if (creature.isPlant) {
      return [{ x: creature.x, y: creature.y, r: creature.radius }]
    }

    const s = creature.scale
    const cos = Math.cos(creature.angle)
    const sin = Math.sin(creature.angle)

    return creature.bodySegments.map(seg => ({
      x: creature.x + (seg.x * cos - seg.y * sin) * s,
      y: creature.y + (seg.x * sin + seg.y * cos) * s,
      r: seg.r * s
    }))
  }

  findOverlap(a, b) {
    const circlesA = this.getBodyCircles(a)
    const circlesB = this.getBodyCircles(b)

    let totalNx = 0
    let totalNy = 0
    let maxOverlap = 0
    let count = 0

    for (const ca of circlesA) {
      for (const cb of circlesB) {
        const dx = cb.x - ca.x
        const dy = cb.y - ca.y
        const rr = ca.r + cb.r
        const d2 = dx * dx + dy * dy
        if (d2 < rr * rr) {
          const d = Math.max(1e-6, Math.sqrt(d2))
          const overlap = rr - d
          totalNx += dx / d
          totalNy += dy / d
          if (overlap > maxOverlap) maxOverlap = overlap
          count++
        }
      }
    }

    if (count === 0) return null

    const len = Math.sqrt(totalNx * totalNx + totalNy * totalNy)
    if (len < 1e-6) return [1, 0, maxOverlap ]

    return [totalNx / len, totalNy / len, maxOverlap]
  }

  resolveCollision(a, b) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const rr = a.radius + b.radius
    const d2 = dx * dx + dy * dy
    if (d2 >= rr * rr) {
      return
    }

    let nx, ny, overlapDist

    if (a.isPlant && b.isPlant) {
      // Already have the answer
      const d = Math.max(1e-6, Math.sqrt(d2))
      nx = dx / d
      ny = dy / d
      overlapDist = rr - d
    } else {
      const overlap = this.findOverlap(a, b)
      if (!overlap) return
      [ nx, ny, overlapDist ] = overlap
    }

    const push = overlapDist * 0.505
    a.x -= nx * push
    a.y -= ny * push
    b.x += nx * push
    b.y += ny * push

    const wa = a.energy / (a.energy + b.energy)
    const wb = 1 - wa
    const avgVx = wa * a.vx + wb * b.vx
    const avgVy = wa * a.vy + wb * b.vy

    a.vx = avgVx
    a.vy = avgVy
    b.vx = avgVx
    b.vy = avgVy
  }

  stepOnce() {
    timings.start('hash1')
    for (let c of this.creatures) {
      this.hash.insert(c, c.x, c.y)
    }

    timings.start('act')
    for (let i = 0; i < this.creatures.length; i++) {
      this.creatures[i].act()
    }

    timings.start('integrate')
    for (let i = 0; i < this.creatures.length; i++) {
      this.creatures[i].integrate()
    }

    timings.start('hash2')
    for (let c of this.creatures) {
      this.hash.insert(c, c.x, c.y)
    }

    timings.start('sorting')
    this.creatures.sort((a, b) => b.radius - a.radius)
    timings.start('collisions')

    for (let a of this.creatures) {
      const ar = a.radius
      const near = this.hash.queryArea(
        a.x - ar - ar,
        a.y - ar - ar,
        a.x + ar + ar,
        a.y + ar + ar
      )
      for (let b of near) {
        if (a === b) continue
        if (b.radius > ar) continue

        const dx = b.x - a.x
        const dy = b.y - a.y
        const rr = ar + b.radius
        if (dx * dx + dy * dy >= rr * rr) continue

        this.resolveCollision(a, b)
      }
    }

    timings.start('birth_or_die')
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i]
      if (c.shouldDie()) {
        this.hash.remove(c)
        this.creatures.splice(i, 1)
        continue
      }
      if (c.shouldDivide()) {
        if (!c.isPlant || this.creatures.length < SETTINGS.maxFood) {
          c.divide()
        } else {
          c.energy = c.maxEnergy
        }
      }
    }
    timings.start('nothing')
    timings.stop()
  }
}
