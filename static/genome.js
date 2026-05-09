import {PartTypes} from './parts.js'
import {NeuralNet} from './neural_net.js'
import {clamp, randn} from "./utils.js";

export class Color {
    constructor(r, g, b) {
        this.r = r
        this.g = g
        this.b = b
    }

    clone() {
        return new Color(this.r, this.g, this.b)
    }

    mutate(rate) {
        if (Math.random() < rate) {
            const delta = (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 7) | 0))
            this.r = clamp(this.r + delta, 0, 255)
        }
        if (Math.random() < rate) {
            const delta = (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 7) | 0))
            this.g = clamp(this.g + delta, 0, 255)
        }
        if (Math.random() < rate) {
            const delta = (Math.random() < 0.5 ? -1 : 1) * (1 + ((Math.random() * 7) | 0))
            this.b = clamp(this.b + delta, 0, 255)
        }
    }

    toRGB() {
        return `rgb(${this.r | 0},${this.g | 0},${this.b | 0})`
    }

    toArray() {
        return [this.r, this.g, this.b]
    }
}

export class BodySegment {
    constructor(distance, radius) {
        this.distance = distance
        this.radius = radius
    }

    clone() {
        return new BodySegment(this.distance, this.radius)
    }

    mutate(rate) {
        if (Math.random() < rate) {
            this.distance = clamp(this.distance + randn() * 0.1, 0, 3)
        }
        if (Math.random() < rate) {
            this.radius = clamp(this.radius + randn() * 0.1, 0.2, 1.5)
        }
        return this
    }
}

export class PartDef {
    constructor(type, slot, repeat, tilt, size) {
        this.type = type
        this.slot = slot
        this.repeat = repeat
        this.tilt = tilt
        this.size = size
    }

    clone() {
        return new PartDef(this.type, this.slot, this.repeat, this.tilt, this.size)
    }

    mutate(rate) {
        if (Math.random() < rate) {
            this.slot = (this.slot + Math.floor(randn() * 3) + 120) % 120
        }
        if (Math.random() < rate) {
            this.tilt = this.tilt + randn() * 0.12
        }
        if (Math.random() < rate) {
            this.size = clamp(this.size + randn() * 0.1, 0.5, 2)
        }
        return this
    }
}

export class Genome {
    constructor(radialRepeats, mirror, bodySegments, parts, hue, maxEnergy, mutationRate) {
        this.radialRepeats = radialRepeats
        this.mirror = mirror
        bodySegments.sort((a, b) => a.distance - b.distance)
        const offset = bodySegments[0].distance
        for (const seg of bodySegments) {
            seg.distance = Math.abs(seg.distance - offset)
        }
        this.bodySegments = bodySegments
        this.parts = parts
        this.hue = hue
        this.maxEnergy = maxEnergy
        this.mutationRate = mutationRate
        this.net = null
    }

    isOnAxis(slot) {
        const sliceSize = 120 / this.radialRepeats
        const posInSlice = slot % sliceSize
        return posInSlice === 0 || (this.mirror && posInSlice === sliceSize / 2)
    }

    mirrorSlot(slot) {
        const sliceSize = 120 / this.radialRepeats
        const posInSlice = slot % sliceSize
        const mirroredPosInSlice = sliceSize - posInSlice
        return (slot - posInSlice) + mirroredPosInSlice
    }

    calculateNetSize() {
        let inputs = 0
        let outputs = 0
        const slotsPerRepeat = 120 / this.radialRepeats

        for (const def of this.parts) {
            for (let r = 0; r < def.repeat; r++) {
                const slotIndex = Math.floor((def.slot + r * slotsPerRepeat) % 120)
                inputs += def.type.outputs
                outputs += def.type.inputs
                if (this.mirror && slotIndex !== 0 && slotIndex !== 60) {
                    inputs += def.type.outputs
                    outputs += def.type.inputs
                }
            }
        }
        return {inputs, outputs}
    }

    buildNet() {
        const {inputs, outputs} = this.calculateNetSize()
        const hiddenSize = Math.ceil((inputs + outputs) / 2)
        this.net = new NeuralNet(Math.max(1, inputs), hiddenSize, Math.max(1, outputs))
    }

    wire(inputPartDef, inputChannel, outputPartDef, mirror, strength) {
        if (!this.net) {
            this.buildNet()
        }

        const slotsPerRepeat = 120 / this.radialRepeats

        const inputInstances = []
        const outputInstances = []

        let inputIdx = 0
        let outputIdx = 0

        for (const def of this.parts) {
            for (let r = 0; r < def.repeat; r++) {
                const slotIndex = Math.floor((def.slot + r * slotsPerRepeat) % 120)

                if (def === inputPartDef) {
                    inputInstances.push({slotIndex, netIndex: inputIdx + inputChannel})
                }
                if (def === outputPartDef) {
                    outputInstances.push({slotIndex, netIndex: outputIdx})
                }

                inputIdx += def.type.outputs
                outputIdx += def.type.inputs

                if (this.mirror && !this.isOnAxis(slotIndex)) {
                    const mirroredSlot = this.mirrorSlot(slotIndex)

                    if (def === inputPartDef) {
                        inputInstances.push({slotIndex: mirroredSlot, netIndex: inputIdx + inputChannel})
                    }
                    if (def === outputPartDef) {
                        outputInstances.push({slotIndex: mirroredSlot, netIndex: outputIdx})
                    }

                    inputIdx += def.type.outputs
                    outputIdx += def.type.inputs
                }
            }
        }

        for (const inp of inputInstances) {
            let targetSlot = mirror ? this.mirrorSlot(inp.slotIndex) : inp.slotIndex

            let bestOut = outputInstances[0]
            let bestDist = Math.abs(bestOut.slotIndex - targetSlot)
            for (const out of outputInstances) {
                const dist = Math.min(
                    Math.abs(out.slotIndex - targetSlot),
                    120 - Math.abs(out.slotIndex - targetSlot)
                )
                if (dist < bestDist) {
                    bestDist = dist
                    bestOut = out
                }
            }

            if (bestOut) {
                const h = inp.netIndex % this.net.hiddenSize
                this.net.weightsIH[inp.netIndex][h] = strength
                this.net.weightsHO[h][bestOut.netIndex] = 1
            }
        }
    }

    cloneMutated() {
        const rate = this.mutationRate

        const g = new Genome(
            this.radialRepeats,
            this.mirror,
            this.bodySegments.map(s => s.clone().mutate(rate)),
            this.parts.map(p => p.clone().mutate(rate)),
            this.hue,
            this.maxEnergy,
            this.mutationRate
        )

        if (this.net) {
            g.net = this.net.clone()
            //g.net.mutate(this.mutationRate)
        }

        if (Math.random() < rate * 0.3) {
            g.mutationRate = clamp(g.mutationRate * (1 + randn() * 0.15), 0.001, 0.25)
        }
        if (Math.random() < rate) {
            g.maxEnergy = clamp(g.maxEnergy + randn() * 180, 500, 8000)
        }
        if (Math.random() < rate) {
            g.hue = (g.hue + randn() * 10 + 360) % 360
        }

        return g
    }

    validate() {
        if (this.bodySegments.length === 0) return false

        for (const seg of this.bodySegments) {
            if (seg.radius < 0.2) return false
            if (seg.distance < 0) return false
            if (seg.distance > 3) return false
        }

        if (this.bodySegments.length > 1) {
            const adjacent = this.bodySegments.map(() => [])

            for (let i = 0; i < this.bodySegments.length; i++) {
                for (let j = i + 1; j < this.bodySegments.length; j++) {
                    const a = this.bodySegments[i]
                    const b = this.bodySegments[j]
                    const dist = Math.abs(a.distance - b.distance)

                    const smallerR = Math.min(a.radius, b.radius)
                    const largerR = Math.max(a.radius, b.radius)
                    if (dist + smallerR < largerR + smallerR * 0.5) return false

                    const maxDist = a.radius + b.radius
                    if (dist < maxDist) {
                        adjacent[i].push(j)
                        adjacent[j].push(i)
                    }
                }
            }

            // Flood fill from segment 0
            const visited = new Set([0])
            const queue = [0]

            while (queue.length > 0) {
                const i = queue.pop()
                for (const j of adjacent[i]) {
                    if (!visited.has(j)) {
                        visited.add(j)
                        queue.push(j)
                    }
                }
            }

            if (visited.size !== this.bodySegments.length) return false
        }

        let hasEye = false, hasMouth = false, hasEngine = false
        for (const part of this.parts) {
            if (part.type === PartTypes.EYE) hasEye = true
            if (part.type === PartTypes.MOUTH) hasMouth = true
            if (part.type === PartTypes.ENGINE) hasEngine = true
        }
        if (!hasEye || !hasMouth || !hasEngine) return false

        return true
    }

    toJSON() {
        return {
            radialRepeats: this.radialRepeats,
            mirror: this.mirror,
            bodySegments: this.bodySegments.map(s => ({distance: s.distance, radius: s.radius})),
            parts: this.parts.map(p => ({
                type: p.type.name,
                slot: p.slot,
                repeat: p.repeat,
                tilt: p.tilt,
                size: p.size
            })),
            hue: this.hue,
            maxEnergy: this.maxEnergy,
            mutationRate: this.mutationRate,
            net: this.net ? this.net.toJSON() : null
        }
    }

    static fromJSON(data) {
        const bodySegments = data.bodySegments.map(s => new BodySegment(s.distance, s.radius))
        const parts = data.parts.map(p => new PartDef(PartTypes[p.type.toUpperCase()], p.slot, p.repeat, p.tilt, p.size))

        const g = new Genome(
            data.radialRepeats,
            data.mirror,
            bodySegments,
            parts,
            data.hue,
            data.maxEnergy,
            data.mutationRate
        )

        if (data.net) {
            g.net = NeuralNet.fromJSON(data.net)
        }

        return g
    }

    static createDefault() {
        const eye = new PartDef(PartTypes.EYE, 10, 1, -0.6, 1)
        const mouth = new PartDef(PartTypes.MOUTH, 0, 1, 0, 1)
        const sideEngine = new PartDef(PartTypes.ENGINE, 50, 1, 0.3, 1)
        const midEngine = new PartDef(PartTypes.ENGINE, 60, 1, 0, 1)

        const g = new Genome(
            1,
            true,
            [new BodySegment(0, 1), new BodySegment(1.2, 0.6)],
            [eye, mouth, sideEngine, midEngine],
            0.8,
            2000,
            0.05
        )

        g.buildNet()
        // g.net.zero()
        // g.wire(eye, 1, sideEngine, true, 1.0)
        // g.wire(eye, 1, midEngine, true, 0.5)

        return g
    }

    static createTriple() {
        const eye = new PartDef(PartTypes.EYE, 0, 3, 0, 1)
        const mouth = new PartDef(PartTypes.MOUTH, 20, 3, 0, 1)
        const engine = new PartDef(PartTypes.ENGINE, 10, 3, 0.3, 1)

        const g = new Genome(
            3,
            false,
            [new BodySegment(0, 0.8), new BodySegment(0.6, 0.5)],
            [eye, mouth, engine],
            240,
            2000,
            0.25
        )

        g.buildNet()

        return g
    }

    static pickRadialRepeats() {
        let r = Math.random()
        // if (r < 0.6) return 1
        // if (r < 0.7) return 2
        // if (r < 0.9) return 3
        // if (r < 0.95) return 4
        // return 5
        if (r < 0.6) return 2
        if (r < 0.7) return 3
        if (r < 0.9) return 4
        if (r < 0.95) return 5
        return 6

    }

    static createRandom() {
        const radialRepeats = this.pickRadialRepeats()
        const mirror = Math.random() < 1 - radialRepeats * 0.15

        const numSegments = 1 + Math.floor(Math.random() * 3)
        const bodySegments = []
        let x = 0
        let prevRadius = 0
        for (let i = 0; i < numSegments; i++) {
            const radius = 0.4 + Math.random() * 0.6
            if (i > 0) {
                const overlap = (0.3 + Math.random() * 0.4) * Math.min(radius, prevRadius)
                x += prevRadius + radius - overlap
            }
            bodySegments.push(new BodySegment(x, radius))
            prevRadius = radius
        }

        const groups = []
        let remaining = radialRepeats
        while (remaining > 0) {
            const size = Math.min(remaining, 1 + Math.floor(Math.random() * remaining))
            groups.push(size)
            remaining -= size
        }

        const sliceSize = 120 / radialRepeats
        const maxSlot = mirror ? Math.floor(sliceSize / 2) : sliceSize

        const budget = {}
        for (const key of Object.keys(PartTypes)) {
            budget[key] = 1 + Math.floor(Math.random() * 4)
        }

        const parts = []

        for (const key of Object.keys(PartTypes)) {
            while (budget[key] > 0) {
                const group = groups[Math.floor(Math.random() * groups.length)]
                let slot = Math.floor(Math.random() * maxSlot)
                const tilt = (Math.random() - 0.5) * 0.6
                const size = 0.8 + Math.random() * 0.4

                const axisThreshold = 3
                const mirrorAxis = sliceSize / 2
                if (slot <= axisThreshold) {
                    slot = 0
                } else if (mirror && Math.abs(slot - mirrorAxis) <= axisThreshold) {
                    slot = mirrorAxis
                }

                const onAxis = slot === 0 || (mirror && slot === Math.floor(sliceSize / 2))
                const actualCount = group * (mirror && !onAxis ? 2 : 1)

                parts.push(new PartDef(PartTypes[key], slot, group, tilt, size))
                budget[key] -= actualCount
            }
        }

        const hue = Math.random() * 360
        const g = new Genome(
            radialRepeats,
            mirror,
            bodySegments,
            parts,
            hue,
            1500 + Math.random() * 1000,
            0.03 + Math.random() * 0.04
        )

        g.buildNet()
        return g
    }
}