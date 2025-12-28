import {clamp, TAU} from "./utils.js";

const SHOW_VISION_CONES = false
const ANIMATE_ENGINE = true

const partTypeList = [
  {
    name: 'eye',
    outputs: 3,
    inputs: 0,

    act(world, creature, px, py, angle, state) {
      const cone = Math.PI / 6 * state.def.size
      const sense = world.filterSee(px, py, angle, cone)
      state.outputs[0] = Math.min(1, sense.r)
      state.outputs[1] = Math.min(1, sense.g)
      state.outputs[2] = Math.min(1, sense.b)
    },

    draw(ctx, state) {
      const coneAngle = Math.PI / 6 * state.def.size
      const coneLength = 2

      if (SHOW_VISION_CONES) {
        ctx.beginPath()
        ctx.strokeStyle = `rgba(${state.outputs[0] * 255 | 0}, ${state.outputs[1] * 255 | 0}, ${state.outputs[2] * 255 | 0}, 1.0)`
        ctx.lineWidth = 0.1
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(-coneAngle) * coneLength, Math.sin(-coneAngle) * coneLength)
        ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(coneAngle) * coneLength, Math.sin(coneAngle) * coneLength)
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.fillStyle = "rgb(80,80,128)"
      ctx.strokeStyle = "rgb(0,0,0)"
      ctx.lineWidth = 0.025
      ctx.arc(0, 0, 0.1 * state.def.size, 0, TAU)
      ctx.fill()
      ctx.stroke()
    },

    info(state) {
      const [r, g, b] = state.outputs
      return `eye[${state.slotIndex}]: r=${r.toFixed(2)} g=${g.toFixed(2)} b=${b.toFixed(2)}`
    },

    energyCost(state) {
      return state.def.size
    }
  },

  {
    name: 'mouth',
    outputs: 1,
    inputs: 0,

    act(world, creature, px, py, angle, state) {
      const reach = 0.2 * state.def.size * creature.scale
      const mx = px + Math.cos(angle) * reach
      const my = py + Math.sin(angle) * reach

      const target = world.findAt(mx, my, creature)

      if (!target) {
        state.outputs[0] = 0
        return
      }

      const maxTransfer = Math.min(target.energy, creature.energy / 500 * state.def.size)

      creature.energy += maxTransfer
      target.energy -= maxTransfer
      state.outputs[0] = clamp((500 * maxTransfer) / Math.max(1e-6, creature.energy), 0, 2)
    },

    draw(ctx, state) {
      const reach = 0.2 * state.def.size
      const size = 0.05 * state.def.size

      ctx.strokeStyle = "rgb(190,190,190)"
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.moveTo(0, -size)
      ctx.lineTo(reach, -size)
      ctx.moveTo(0, size)
      ctx.lineTo(reach, size)
      ctx.stroke()
    },

    info(state) {
      return `mouth[${state.slotIndex}]: eating=${state.outputs[0].toFixed(2)}`
    },

    energyCost(state) {
      return state.def.size
    }
  },

  {
    name: 'engine',
    outputs: 0,
    inputs: 1,

    act(world, creature, px, py, angle, state) {
      state.speed = clamp(state.inputs[0] * 100, 0, 100)
      state.animPhase = (state.animPhase || 0) + state.speed * 0.05

      const slot = creature.slots[state.slotIndex]
      const power = 0.008 * state.speed * state.def.size

      const thrustX = -Math.cos(angle) * power
      const thrustY = -Math.sin(angle) * power

      creature.vx += thrustX
      creature.vy += thrustY

      const localThrustAngle = slot.angle + state.def.tilt
      const localThrustX = -Math.cos(localThrustAngle) * power
      const localThrustY = -Math.sin(localThrustAngle) * power
      const torque = slot.x * localThrustY - slot.y * localThrustX

      creature.angularVelocity += torque * 0.15
    },

    draw(ctx, state) {
      const size = state.def.size
      const animPhase = state.animPhase || 0

      ctx.save()
      ctx.rotate(state.def.tilt)
      ctx.strokeStyle = "rgb(150,150,255)"
      ctx.lineWidth = 0.025 * size
      ctx.beginPath()

      const segments = 8
      const length = 0.7 * size
      ctx.moveTo(0, 0)
      for (let i = 1; i <= segments; i++) {
        const t = i / segments
        const x = t * length
        const y = Math.sin(animPhase + t * 5) * 0.08 * size * (t + 1)
        ctx.lineTo(x, ANIMATE_ENGINE ? y: 0)
      }
      ctx.stroke()
      ctx.restore()
    },

    info(state) {
      return `engine[${state.slotIndex}]: speed=${(state.speed || 0).toFixed(1)}`
    },

    energyCost(state) {
      return state.def.size + (state.speed || 0) / 20
    }
  }
]

export const PartTypes = Object.fromEntries(
  partTypeList.map(pt => [pt.name.toUpperCase(), pt])
)