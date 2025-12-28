import {TAU, rand, randn, clamp, colorFromHue } from './utils.js'
import {buildSlots} from './skeleton_builder.js'
import {SETTINGS} from "./world.js";

const RENDER_OUTLINE = false

class Creature {
    constructor(world, x, y) {
        this.world = world
        this.x = x
        this.y = y
        this.vx = 0
        this.vy = 0
        this.id = world.nextId++
        this.energy = 0
        this._lastenergy = 0
        this._last_radius = 0
    }

    get radius() {
        if (this._lastenergy != this.energy) {
            this._last_radius = Math.sqrt(this.energy)
            this._lastenergy = this.energy
        }
        return this._last_radius
    }

    integrate() {
        this.x += this.vx
        this.y += this.vy

        const linearDamping = 1 - SETTINGS.linearDamping * (this.vx * this.vx + this.vy * this.vy)
        this.vx = this.vx * linearDamping + randn() * (SETTINGS.brownianNoise / 100)
        this.vy = this.vy * linearDamping + randn() * (SETTINGS.brownianNoise / 100)

        this.vx -= this.x * SETTINGS.gravity
        this.vy -= this.y * SETTINGS.gravity

        this.updateEnergy()
    }

    updateEnergy() {
    }

    act() {
    }

    shouldDie() {
        return this.energy < SETTINGS.minEnergyFraction * this.maxEnergy
    }

    shouldDivide() {
        return this.energy > this.maxEnergy
    }

    divide() {
    }

    draw(ctx) {
    }
}

export class Plant extends Creature {
    constructor(world, x, y) {
        super(world, x, y)
        this.energy = 100
        this.maxEnergy = 160
        const hue = rand(80, 120)
        this.color = colorFromHue(hue, 60, 40)
        this.isPlant = true
    }

    livingCost() {
        return SETTINGS.livingCost * SETTINGS.baseCreatureCost
    }

    updateEnergy() {
        const stillness = this.vx * this.vx + this.vy * this.vy + 0.2
        this.energy = this.energy + SETTINGS.sunlight / stillness - this.livingCost()
    }

    divide() {
        const w = this.world
        const e = this.energy * 0.5
        this.energy = e

        const child = new Plant(w, this.x + rand(8, -8), this.y + rand(8, -8))
        child.energy = e
        child.vx = this.vx
        child.vy = this.vy

        w.add(child)
        return child
    }

    draw(ctx) {
        const r = this.radius

        ctx.beginPath()
        ctx.fillStyle =  `rgb(${this.color[0] | 0},${this.color[1] | 0},${this.color[2] | 0})`
        ctx.strokeStyle = "rgba(180,180,180,0.85)"
        ctx.lineWidth = 0.04 * r
        ctx.arc(this.x, this.y, r, 0, TAU)
        ctx.fill()
        ctx.stroke()
    }
}

export class Animal extends Creature {
    constructor(world, x, y, genome) {
        super(world, x, y)
        this.genome = genome
        this.energy = 1250

        this.noiseCountdown = 0
        this.savedNet = null
        this.energyAtNoiseStart = 0

        this.angle = rand(TAU)
        this.angularVelocity = 0
        const {slots, segments, maxExtent} = buildSlots(this.genome.bodySegments, this.genome.radialRepeats, 120)
        this.slots = slots
        this.bodySegments = segments
        this.maxExtent = maxExtent
        this.partStates = this.buildPartStates()
        this.isPlant = false
        this.stunCount = 0
        this.color = colorFromHue(this.genome.hue, 60, 40)
    }

    get maxEnergy() {
        return this.genome.maxEnergy
    }

    get scale() {
        return Math.sqrt(this.energy * Math.PI)
    }

    get radius() {
        return this.scale * this.maxExtent
    }

    buildPartStates() {
        const states = []
        const sliceSize = 120 / this.genome.radialRepeats

        for (const def of this.genome.parts) {
            for (let r = 0; r < def.repeat; r++) {
                const slotIndex = Math.floor((def.slot + r * sliceSize) % 120)

                states.push({
                    def,
                    slotIndex,
                    outputs: new Array(def.type.outputs).fill(0),
                    inputs: new Array(def.type.inputs).fill(0)
                })

                if (this.genome.mirror && !this.genome.isOnAxis(slotIndex)) {
                    const mirroredSlot = this.genome.mirrorSlot(slotIndex)
                    states.push({
                        def: {...def, tilt: -def.tilt},
                        slotIndex: mirroredSlot,
                        outputs: new Array(def.type.outputs).fill(0),
                        inputs: new Array(def.type.inputs).fill(0)
                    })
                }
            }
        }

        states.sort((a, b) => {
            const aBalance = a.def.type.outputs - a.def.type.inputs
            const bBalance = b.def.type.outputs - b.def.type.inputs
            return bBalance - aBalance
        })

        return states
    }

    partsEnergyCost() {
        let cost = 0
        for (const state of this.partStates) {
            cost += state.def.type.energyCost(state)
        }
        return cost
    }

    livingCost() {
        return SETTINGS.livingCost * (SETTINGS.baseCreatureCost + this.radius * SETTINGS.radiusCost + this.partsEnergyCost() * SETTINGS.partsCost)
    }

    updateEnergy() {
        const cost = this.livingCost();
        this.energy = this.energy - cost
    }

    integrate() {
        super.integrate()
        this.angle += this.angularVelocity
        this.angularVelocity = this.angularVelocity * (1 - SETTINGS.angularDamping)
    }

    stunFor(frames) {
        this.stunCount = frames
    }

    act() {
        if (this.stunCount > 0) {
            this.stunCount -= 1;
            return;
        }
        const processParts = (processInputs) => {
            const s = this.scale
            const cos = Math.cos(this.angle)
            const sin = Math.sin(this.angle)

            for (const state of this.partStates) {
                const isInput = state.def.type.inputs > state.def.type.outputs

                if (isInput === processInputs) {
                    const slot = this.slots[state.slotIndex]
                    const px = this.x + (slot.x * cos - slot.y * sin) * s
                    const py = this.y + (slot.x * sin + slot.y * cos) * s
                    const pAngle = this.angle + slot.angle + state.def.tilt

                    state.def.type.act(this.world, this, px, py, pAngle, state)
                }
            }
        }

        processParts(false)

        const inputs = []
        for (const state of this.partStates) {
            for (const output of state.outputs) {
                inputs.push(output)
            }
        }

        const outputs = this.genome.net.forward(inputs)

        if (this.noiseCountdown > 0) {
          this.noiseCountdown--
          if (this.noiseCountdown === 0) {
            if (this.energy <= this.energyAtNoiseStart) {
              this.genome.net = this.savedNet
            }
            this.savedNet = null
          }
        } else {
          this.savedNet = this.genome.net.clone()
          this.energyAtNoiseStart = this.energy
          this.genome.net.mutate(1.0)
          this.noiseCountdown = 100
        }

        let outIdx = 0
        for (const state of this.partStates) {
            for (let i = 0; i < state.inputs.length; i++) {
                state.inputs[i] = outputs[outIdx++] || 0
            }
        }

        processParts(true)

        this.vx = clamp(this.vx, -SETTINGS.maxVelocity, SETTINGS.maxVelocity)
        this.vy = clamp(this.vy, -SETTINGS.maxVelocity, SETTINGS.maxVelocity)
        this.angularVelocity = clamp(this.angularVelocity, -SETTINGS.maxAngularVelocity, SETTINGS.maxAngularVelocity)
    }

    divide() {
        const w = this.world
        const e = this.energy * 0.5
        this.energy = e

        const mutatedGenome = this.genome.cloneMutated()
        if (!mutatedGenome.validate()) {
            return null
        }
        const child = new Animal(w, this.x + this.vx + rand(10, -10), this.y + this.vy + rand(10, -10), mutatedGenome)

        child.energy = e
        child.angle = this.angle + Math.PI
        child.vx = this.vx
        child.vy = this.vy
        child.angularVelocity = this.angularVelocity

        w.add(child)
        return child
    }

    draw(ctx) {
        const s = this.scale

        ctx.fillStyle = `rgb(${this.color[0]},${this.color[1]},${this.color[2]})`
        ctx.strokeStyle = "rgba(180,180,180,0.85)"

        ctx.save()
        ctx.translate(this.x, this.y)
        ctx.rotate(this.angle)
        ctx.scale(s, s)

        ctx.lineWidth = 0.025;

        ctx.beginPath()
        ctx.moveTo(this.slots[0].x, this.slots[0].y)
        for (let i = 1; i < this.slots.length; i++) {
            ctx.lineTo(this.slots[i].x, this.slots[i].y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        if (RENDER_OUTLINE) {
            ctx.strokeStyle = "rgba(255,0,0,0.5)"
            ctx.beginPath()
            ctx.arc(0, 0, this.maxExtent, 0, TAU)
            ctx.stroke()
        }

        for (const state of this.partStates) {
            const slot = this.slots[state.slotIndex]
            ctx.save()
            ctx.translate(slot.x, slot.y)
            ctx.rotate(slot.angle + state.def.tilt)
            state.def.type.draw(ctx, state)
            ctx.restore()
        }

        ctx.restore()
    }
}